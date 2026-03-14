"""initial schema

Revision ID: 26025150d7ba
Revises:
Create Date: 2026-03-14 22:13:07.806432

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import geoalchemy2
from sqlalchemy.dialects import postgresql

revision: str = '26025150d7ba'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('airport',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('icao_code', sa.String(length=4), nullable=False),
    sa.Column('name', sa.String(), nullable=False),
    sa.Column('elevation', sa.Float(), nullable=False),
    sa.Column('location', geoalchemy2.types.Geometry(geometry_type='POINTZ', srid=4326, from_text='ST_GeomFromEWKT', name='geometry', nullable=False), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('icao_code')
    )
    op.create_table('drone_profile',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(), nullable=False),
    sa.Column('manufacturer', sa.String(), nullable=True),
    sa.Column('model', sa.String(), nullable=True),
    sa.Column('max_speed', sa.Float(), nullable=True),
    sa.Column('max_climb_rate', sa.Float(), nullable=True),
    sa.Column('max_altitude', sa.Float(), nullable=True),
    sa.Column('battery_capacity', sa.Float(), nullable=True),
    sa.Column('endurance_minutes', sa.Float(), nullable=True),
    sa.Column('camera_resolution', sa.String(), nullable=True),
    sa.Column('camera_frame_rate', sa.Integer(), nullable=True),
    sa.Column('sensor_fov', sa.Float(), nullable=True),
    sa.Column('weight', sa.Float(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('inspection_configuration',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('altitude_offset', sa.Float(), nullable=True),
    sa.Column('speed_override', sa.Float(), nullable=True),
    sa.Column('measurement_density', sa.Integer(), nullable=True),
    sa.Column('custom_tolerances', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('density', sa.Float(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('airfield_surface',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('airport_id', sa.UUID(), nullable=False),
    sa.Column('identifier', sa.String(length=10), nullable=False),
    sa.Column('surface_type', sa.String(length=20), nullable=False),
    sa.Column('geometry', geoalchemy2.types.Geometry(geometry_type='LINESTRINGZ', srid=4326, from_text='ST_GeomFromEWKT', name='geometry', nullable=False), nullable=False),
    sa.Column('heading', sa.Float(), nullable=True),
    sa.Column('length', sa.Float(), nullable=True),
    sa.Column('width', sa.Float(), nullable=True),
    sa.Column('threshold_position', geoalchemy2.types.Geometry(geometry_type='POINTZ', srid=4326, from_text='ST_GeomFromEWKT', name='geometry'), nullable=True),
    sa.Column('end_position', geoalchemy2.types.Geometry(geometry_type='POINTZ', srid=4326, from_text='ST_GeomFromEWKT', name='geometry'), nullable=True),
    sa.Column('taxiway_width', sa.Float(), nullable=True),
    sa.CheckConstraint("surface_type IN ('RUNWAY', 'TAXIWAY')", name='ck_airfield_surface_type'),
    sa.ForeignKeyConstraint(['airport_id'], ['airport.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('inspection_template',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(), nullable=False),
    sa.Column('description', sa.String(), nullable=True),
    sa.Column('default_config_id', sa.UUID(), nullable=True),
    sa.Column('angular_tolerances', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('created_by', sa.String(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.ForeignKeyConstraint(['default_config_id'], ['inspection_configuration.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('mission',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('operator_notes', sa.String(), nullable=True),
    sa.Column('drone_profile_id', sa.UUID(), nullable=True),
    sa.Column('date_time', sa.DateTime(timezone=True), nullable=True),
    sa.Column('default_speed', sa.Float(), nullable=True),
    sa.Column('default_altitude_offset', sa.Float(), nullable=True),
    sa.Column('takeoff_coordinate', geoalchemy2.types.Geometry(geometry_type='POINTZ', srid=4326, from_text='ST_GeomFromEWKT', name='geometry'), nullable=True),
    sa.Column('landing_coordinate', geoalchemy2.types.Geometry(geometry_type='POINTZ', srid=4326, from_text='ST_GeomFromEWKT', name='geometry'), nullable=True),
    sa.CheckConstraint("status IN ('DRAFT', 'PLANNED', 'VALIDATED', 'EXPORTED', 'COMPLETED', 'CANCELLED')", name='ck_mission_status'),
    sa.ForeignKeyConstraint(['drone_profile_id'], ['drone_profile.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('obstacle',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('airport_id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(), nullable=False),
    sa.Column('position', geoalchemy2.types.Geometry(geometry_type='POINTZ', srid=4326, from_text='ST_GeomFromEWKT', name='geometry', nullable=False), nullable=False),
    sa.Column('height', sa.Float(), nullable=False),
    sa.Column('radius', sa.Float(), nullable=False),
    sa.Column('geometry', geoalchemy2.types.Geometry(geometry_type='POLYGONZ', srid=4326, from_text='ST_GeomFromEWKT', name='geometry', nullable=False), nullable=False),
    sa.Column('type', sa.String(length=20), nullable=False),
    sa.CheckConstraint("type IN ('BUILDING', 'TOWER', 'ANTENNA', 'VEGETATION', 'OTHER')", name='ck_obstacle_type'),
    sa.ForeignKeyConstraint(['airport_id'], ['airport.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('safety_zone',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('airport_id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(), nullable=False),
    sa.Column('type', sa.String(length=30), nullable=False),
    sa.Column('geometry', geoalchemy2.types.Geometry(geometry_type='POLYGONZ', srid=4326, from_text='ST_GeomFromEWKT', name='geometry', nullable=False), nullable=False),
    sa.Column('altitude_floor', sa.Float(), nullable=True),
    sa.Column('altitude_ceiling', sa.Float(), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.CheckConstraint("type IN ('CTR', 'RESTRICTED', 'PROHIBITED', 'TEMPORARY_NO_FLY')", name='ck_safety_zone_type'),
    sa.ForeignKeyConstraint(['airport_id'], ['airport.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('agl',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('surface_id', sa.UUID(), nullable=False),
    sa.Column('agl_type', sa.String(length=30), nullable=False),
    sa.Column('name', sa.String(), nullable=False),
    sa.Column('position', geoalchemy2.types.Geometry(geometry_type='POINTZ', srid=4326, from_text='ST_GeomFromEWKT', name='geometry', nullable=False), nullable=False),
    sa.Column('side', sa.String(length=10), nullable=True),
    sa.Column('glide_slope_angle', sa.Float(), nullable=True),
    sa.Column('distance_from_threshold', sa.Float(), nullable=True),
    sa.Column('offset_from_centerline', sa.Float(), nullable=True),
    sa.ForeignKeyConstraint(['surface_id'], ['airfield_surface.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('flight_plan',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('mission_id', sa.UUID(), nullable=False),
    sa.Column('airport_id', sa.UUID(), nullable=False),
    sa.Column('total_distance', sa.Float(), nullable=True),
    sa.Column('estimated_duration', sa.Float(), nullable=True),
    sa.Column('is_validated', sa.Boolean(), nullable=False),
    sa.Column('generated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.ForeignKeyConstraint(['airport_id'], ['airport.id'], ),
    sa.ForeignKeyConstraint(['mission_id'], ['mission.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('mission_id')
    )
    op.create_table('insp_template_methods',
    sa.Column('template_id', sa.UUID(), nullable=False),
    sa.Column('method', sa.String(length=30), nullable=False),
    sa.ForeignKeyConstraint(['template_id'], ['inspection_template.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('template_id', 'method')
    )
    op.create_table('inspection',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('mission_id', sa.UUID(), nullable=False),
    sa.Column('template_id', sa.UUID(), nullable=False),
    sa.Column('config_id', sa.UUID(), nullable=True),
    sa.Column('method', sa.String(length=30), nullable=False),
    sa.Column('sequence_order', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['config_id'], ['inspection_configuration.id'], ),
    sa.ForeignKeyConstraint(['mission_id'], ['mission.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['template_id'], ['inspection_template.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('constraint_rule',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('flight_plan_id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(), nullable=False),
    sa.Column('constraint_type', sa.String(length=30), nullable=False),
    sa.Column('is_hard_constraint', sa.Boolean(), nullable=False),
    sa.Column('min_altitude', sa.Float(), nullable=True),
    sa.Column('max_altitude', sa.Float(), nullable=True),
    sa.Column('max_horizontal_speed', sa.Float(), nullable=True),
    sa.Column('max_vertical_speed', sa.Float(), nullable=True),
    sa.Column('max_flight_time', sa.Float(), nullable=True),
    sa.Column('reserve_margin', sa.Float(), nullable=True),
    sa.Column('lateral_buffer', sa.Float(), nullable=True),
    sa.Column('longitudinal_buffer', sa.Float(), nullable=True),
    sa.Column('boundary', geoalchemy2.types.Geometry(geometry_type='POLYGONZ', srid=4326, from_text='ST_GeomFromEWKT', name='geometry'), nullable=True),
    sa.ForeignKeyConstraint(['flight_plan_id'], ['flight_plan.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('export_result',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('flight_plan_id', sa.UUID(), nullable=False),
    sa.Column('file_name', sa.String(), nullable=False),
    sa.Column('format', sa.String(length=10), nullable=False),
    sa.Column('file_path', sa.String(), nullable=False),
    sa.Column('exported_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.CheckConstraint("format IN ('MAVLINK', 'KML', 'KMZ', 'JSON')", name='ck_export_format'),
    sa.ForeignKeyConstraint(['flight_plan_id'], ['flight_plan.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('insp_template_targets',
    sa.Column('template_id', sa.UUID(), nullable=False),
    sa.Column('agl_id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['agl_id'], ['agl.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['template_id'], ['inspection_template.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('template_id', 'agl_id')
    )
    op.create_table('lha',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('agl_id', sa.UUID(), nullable=False),
    sa.Column('unit_number', sa.Integer(), nullable=False),
    sa.Column('setting_angle', sa.Float(), nullable=False),
    sa.Column('transition_sector_width', sa.Float(), nullable=True),
    sa.Column('lamp_type', sa.String(length=10), nullable=False),
    sa.Column('position', geoalchemy2.types.Geometry(geometry_type='POINTZ', srid=4326, from_text='ST_GeomFromEWKT', name='geometry', nullable=False), nullable=False),
    sa.CheckConstraint("lamp_type IN ('HALOGEN', 'LED')", name='ck_lha_lamp_type'),
    sa.ForeignKeyConstraint(['agl_id'], ['agl.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('validation_result',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('flight_plan_id', sa.UUID(), nullable=False),
    sa.Column('passed', sa.Boolean(), nullable=False),
    sa.Column('validated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.ForeignKeyConstraint(['flight_plan_id'], ['flight_plan.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('flight_plan_id')
    )
    op.create_table('waypoint',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('flight_plan_id', sa.UUID(), nullable=False),
    sa.Column('inspection_id', sa.UUID(), nullable=True),
    sa.Column('sequence_order', sa.Integer(), nullable=False),
    sa.Column('position', geoalchemy2.types.Geometry(geometry_type='POINTZ', srid=4326, from_text='ST_GeomFromEWKT', name='geometry', nullable=False), nullable=False),
    sa.Column('heading', sa.Float(), nullable=True),
    sa.Column('speed', sa.Float(), nullable=True),
    sa.Column('hover_duration', sa.Float(), nullable=True),
    sa.Column('camera_action', sa.String(length=20), nullable=True),
    sa.Column('waypoint_type', sa.String(length=20), nullable=False),
    sa.Column('camera_target', geoalchemy2.types.Geometry(geometry_type='POINTZ', srid=4326, from_text='ST_GeomFromEWKT', name='geometry'), nullable=True),
    sa.CheckConstraint("camera_action IN ('NONE', 'PHOTO_CAPTURE', 'RECORDING_START', 'RECORDING_STOP')", name='ck_waypoint_camera_action'),
    sa.CheckConstraint("waypoint_type IN ('TAKEOFF', 'TRANSIT', 'MEASUREMENT', 'HOVER', 'LANDING')", name='ck_waypoint_type'),
    sa.ForeignKeyConstraint(['flight_plan_id'], ['flight_plan.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['inspection_id'], ['inspection.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('validation_violation',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('validation_result_id', sa.UUID(), nullable=False),
    sa.Column('constraint_id', sa.UUID(), nullable=True),
    sa.Column('is_warning', sa.Boolean(), nullable=False),
    sa.Column('message', sa.String(), nullable=False),
    sa.ForeignKeyConstraint(['constraint_id'], ['constraint_rule.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['validation_result_id'], ['validation_result.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('validation_violation')
    op.drop_table('waypoint')
    op.drop_table('validation_result')
    op.drop_table('lha')
    op.drop_table('insp_template_targets')
    op.drop_table('export_result')
    op.drop_table('constraint_rule')
    op.drop_table('inspection')
    op.drop_table('insp_template_methods')
    op.drop_table('flight_plan')
    op.drop_table('agl')
    op.drop_table('safety_zone')
    op.drop_table('obstacle')
    op.drop_table('mission')
    op.drop_table('inspection_template')
    op.drop_table('airfield_surface')
    op.drop_table('inspection_configuration')
    op.drop_table('drone_profile')
    op.drop_table('airport')
