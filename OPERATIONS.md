# Operations

## Architecture Rules

### DDD-Lite Patterns

This codebase uses DDD-lite patterns without changing the project layout:

- **Business logic belongs on model methods**, not in services. Services handle DB access and HTTP concerns only.
- **Aggregate roots**: Mission (owns inspections, controls status transitions), Airport (owns surfaces, obstacles, safety zones).
- **Value objects** in `backend/app/models/value_objects.py`: Coordinate, Speed, AltitudeRange, IcaoCode. Pure Python, no framework dependencies.
- **Status transitions** use `Mission.transition_to()`, never direct `mission.status =` assignment.
- **Child entity creation** goes through aggregate root methods (e.g., `airport.add_surface()`, `mission.add_inspection()`).

### What is NOT DDD

- No directory restructure (no domain/, application/, infrastructure/ folders)
- SQLAlchemy models keep their dual role (no separate domain entities + ORM models)
- No repository interfaces (services use db session directly)
- No domain events or event bus
- No use case classes (services stay as functions)
