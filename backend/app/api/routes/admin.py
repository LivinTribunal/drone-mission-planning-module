"""super admin endpoints for user management, system settings, and audit log."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.dependencies import SuperAdminUser
from app.core.dependencies import get_db
from app.core.enums import AuditAction
from app.schemas.admin import (
    AirportAssignmentUpdate,
    AuditLogResponse,
    InvitationResponse,
    SystemSettingsResponse,
    SystemSettingsUpdate,
    UserAdminResponse,
    UserAdminUpdate,
    UserInviteRequest,
    UserListMeta,
)
from app.services import admin_service, audit_service
from app.utils.audit import log_audit

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


# user management


@router.get("/users", response_model=dict)
def list_users(
    current_user: SuperAdminUser,
    db: Session = Depends(get_db),
    role: str | None = None,
    is_active: bool | None = None,
    airport_id: UUID | None = None,
    search: str | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
):
    """list all users with optional filters."""
    users, total = admin_service.list_users(
        db,
        role=role,
        is_active=is_active,
        airport_id=airport_id,
        search=search,
        limit=limit,
        offset=offset,
    )
    return {
        "data": [UserAdminResponse.model_validate(u) for u in users],
        "meta": UserListMeta(total=total, limit=limit, offset=offset),
    }


@router.get("/users/{user_id}", response_model=UserAdminResponse)
def get_user(
    user_id: UUID,
    current_user: SuperAdminUser,
    db: Session = Depends(get_db),
):
    """get user detail."""
    user = admin_service.get_user(db, user_id)
    return UserAdminResponse.model_validate(user)


@router.post("/users/invite", response_model=InvitationResponse, status_code=201)
def invite_user(
    body: UserInviteRequest,
    current_user: SuperAdminUser,
    request: Request,
    db: Session = Depends(get_db),
):
    """create user with invitation token."""
    user, token = admin_service.invite_user(
        db,
        email=body.email,
        name=body.name,
        role=body.role,
        airport_ids=body.airport_ids,
    )
    invitation_link = f"/auth/setup-password?token={token}"

    log_audit(
        db,
        current_user,
        AuditAction.INVITE_USER,
        entity_type="User",
        entity_id=user.id,
        entity_name=user.email,
        ip_address=request.client.host if request.client else None,
    )
    db.commit()

    return InvitationResponse(
        user=UserAdminResponse.model_validate(user),
        invitation_link=invitation_link,
    )


@router.put("/users/{user_id}", response_model=UserAdminResponse)
def update_user(
    user_id: UUID,
    body: UserAdminUpdate,
    current_user: SuperAdminUser,
    request: Request,
    db: Session = Depends(get_db),
):
    """update user fields."""
    user = admin_service.update_user(db, user_id, body.name, body.email, body.role)

    log_audit(
        db,
        current_user,
        AuditAction.UPDATE,
        entity_type="User",
        entity_id=user.id,
        entity_name=user.email,
        ip_address=request.client.host if request.client else None,
    )
    db.commit()

    return UserAdminResponse.model_validate(user)


@router.put("/users/{user_id}/deactivate", response_model=UserAdminResponse)
def deactivate_user(
    user_id: UUID,
    current_user: SuperAdminUser,
    request: Request,
    db: Session = Depends(get_db),
):
    """soft deactivate user."""
    user = admin_service.deactivate_user(db, user_id)

    log_audit(
        db,
        current_user,
        AuditAction.DEACTIVATE_USER,
        entity_type="User",
        entity_id=user.id,
        entity_name=user.email,
        ip_address=request.client.host if request.client else None,
    )
    db.commit()

    return UserAdminResponse.model_validate(user)


@router.put("/users/{user_id}/activate", response_model=UserAdminResponse)
def activate_user(
    user_id: UUID,
    current_user: SuperAdminUser,
    request: Request,
    db: Session = Depends(get_db),
):
    """reactivate user."""
    user = admin_service.activate_user(db, user_id)

    log_audit(
        db,
        current_user,
        AuditAction.UPDATE,
        entity_type="User",
        entity_id=user.id,
        entity_name=user.email,
        details={"activated": True},
        ip_address=request.client.host if request.client else None,
    )
    db.commit()

    return UserAdminResponse.model_validate(user)


@router.delete("/users/{user_id}")
def delete_user(
    user_id: UUID,
    current_user: SuperAdminUser,
    request: Request,
    db: Session = Depends(get_db),
):
    """hard delete inactive user."""
    user = admin_service.get_user(db, user_id)
    email = user.email

    log_audit(
        db,
        current_user,
        AuditAction.DELETE,
        entity_type="User",
        entity_id=user_id,
        entity_name=email,
        ip_address=request.client.host if request.client else None,
    )

    admin_service.delete_user(db, user_id)
    return {"deleted": True}


@router.post("/users/{user_id}/reset-password")
def reset_password(
    user_id: UUID,
    current_user: SuperAdminUser,
    request: Request,
    db: Session = Depends(get_db),
):
    """generate new password reset link."""
    token = admin_service.reset_password(db, user_id)

    log_audit(
        db,
        current_user,
        AuditAction.UPDATE,
        entity_type="User",
        entity_id=user_id,
        details={"reset_password": True},
        ip_address=request.client.host if request.client else None,
    )
    db.commit()

    return {"invitation_link": f"/auth/setup-password?token={token}"}


@router.put("/users/{user_id}/airports", response_model=UserAdminResponse)
def update_airport_assignments(
    user_id: UUID,
    body: AirportAssignmentUpdate,
    current_user: SuperAdminUser,
    request: Request,
    db: Session = Depends(get_db),
):
    """replace user airport assignments."""
    user = admin_service.update_airport_assignments(db, user_id, body.airport_ids)

    log_audit(
        db,
        current_user,
        AuditAction.ASSIGN_AIRPORT,
        entity_type="User",
        entity_id=user.id,
        entity_name=user.email,
        details={"airport_ids": [str(a) for a in body.airport_ids]},
        ip_address=request.client.host if request.client else None,
    )
    db.commit()

    return UserAdminResponse.model_validate(user)


# airports admin overview


@router.get("/airports")
def list_airports(
    current_user: SuperAdminUser,
    db: Session = Depends(get_db),
    search: str | None = None,
    country: str | None = None,
):
    """list airports with user/mission counts."""
    airports = admin_service.list_airports_admin(db, search=search, country=country)
    return {"data": airports}


# system settings


@router.get("/system-settings", response_model=SystemSettingsResponse)
def get_system_settings(
    current_user: SuperAdminUser,
    db: Session = Depends(get_db),
):
    """get all system settings."""
    settings = admin_service.get_system_settings(db)
    return SystemSettingsResponse(**settings)


@router.put("/system-settings", response_model=SystemSettingsResponse)
def update_system_settings(
    body: SystemSettingsUpdate,
    current_user: SuperAdminUser,
    request: Request,
    db: Session = Depends(get_db),
):
    """update system settings."""
    settings = admin_service.update_system_settings(
        db,
        current_user.id,
        maintenance_mode=body.maintenance_mode,
        cesium_ion_token=body.cesium_ion_token,
        elevation_api_url=body.elevation_api_url,
    )

    safe_details = {
        k: "***" if k == "cesium_ion_token" else v
        for k, v in body.model_dump(exclude_none=True).items()
    }
    log_audit(
        db,
        current_user,
        AuditAction.SYSTEM_SETTING_CHANGE,
        entity_type="SystemSettings",
        details=safe_details,
        ip_address=request.client.host if request.client else None,
    )
    db.commit()

    return SystemSettingsResponse(**settings)


# audit log


@router.get("/audit-log")
def list_audit_logs(
    current_user: SuperAdminUser,
    db: Session = Depends(get_db),
    search: str | None = None,
    action: str | None = None,
    user_id: UUID | None = None,
    entity_type: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    sort_by: str = Query(default="timestamp"),
    sort_dir: str = Query(default="desc"),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
):
    """list audit log entries."""
    entries, total = audit_service.list_audit_logs(
        db,
        search=search,
        action=action,
        user_id=user_id,
        entity_type=entity_type,
        date_from=date_from,
        date_to=date_to,
        sort_by=sort_by,
        sort_dir=sort_dir,
        limit=limit,
        offset=offset,
    )
    return {
        "data": [AuditLogResponse.model_validate(e) for e in entries],
        "meta": {"total": total, "limit": limit, "offset": offset},
    }


@router.get("/audit-log/export")
def export_audit_log(
    current_user: SuperAdminUser,
    db: Session = Depends(get_db),
    date_from: datetime | None = None,
    date_to: datetime | None = None,
):
    """download audit log as csv."""
    csv_content = audit_service.export_audit_csv(db, date_from=date_from, date_to=date_to)
    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit-log.csv"},
    )
