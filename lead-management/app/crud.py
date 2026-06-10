from datetime import datetime, timezone
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Lead, LeadActivity, LeadStatus, LeadSource
from app.schemas import LeadCreate, LeadUpdate


# ── Lead reads ────────────────────────────────────────────────────────────────

def get_lead(db: Session, lead_id: int) -> Lead | None:
    return db.get(Lead, lead_id)


def get_lead_by_email(db: Session, email: str) -> Lead | None:
    return db.scalar(select(Lead).where(Lead.email == email))


def get_leads(
    db: Session,
    status: LeadStatus | None,
    source: LeadSource | None,
    search: str | None,
    skip: int,
    limit: int,
    sort_by: str,
    sort_order: str,
) -> tuple[int, list[Lead]]:
    # Build a base query with all filters applied once — reused for both count and page fetch
    query = select(Lead)

    if status is not None:
        query = query.where(Lead.status == status)
    if source is not None:
        query = query.where(Lead.source == source)
    if search:
        term = f"%{search}%"
        query = query.where(
            Lead.name.ilike(term) | Lead.company.ilike(term)
        )

    # Count total rows matching the filters (before pagination)
    total = db.scalar(select(func.count()).select_from(query.subquery()))

    # Apply sort
    sort_column = getattr(Lead, sort_by, Lead.created_at)
    if sort_order == "asc":
        query = query.order_by(sort_column.asc())
    else:
        query = query.order_by(sort_column.desc())

    items = list(db.scalars(query.offset(skip).limit(limit)).all())
    return total or 0, items


# ── Lead writes ───────────────────────────────────────────────────────────────

def create_lead(db: Session, lead_in: LeadCreate) -> Lead:
    lead = Lead(**lead_in.model_dump())
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return lead


def update_lead(db: Session, lead: Lead, update_data: LeadUpdate) -> Lead:
    data = update_data.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(lead, field, value)
    # Set explicitly so SQLite (used in tests) also picks up the change
    lead.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(lead)
    return lead


def update_lead_status(
    db: Session, lead: Lead, new_status: LeadStatus, note: str | None
) -> Lead:
    old_status = lead.status
    lead.status = new_status
    lead.updated_at = datetime.now(timezone.utc)

    # Log the transition in the same transaction so it never gets out of sync
    activity = LeadActivity(
        lead_id=lead.id,
        activity_type="status_change",
        old_status=old_status,
        new_status=new_status,
        note=note,
    )
    db.add(activity)
    db.commit()
    db.refresh(lead)
    return lead


def delete_lead(db: Session, lead: Lead) -> None:
    db.delete(lead)
    db.commit()


# ── Activity reads / writes ───────────────────────────────────────────────────

def get_activities_for_lead(
    db: Session, lead_id: int, skip: int, limit: int
) -> tuple[int, list[LeadActivity]]:
    base = select(LeadActivity).where(LeadActivity.lead_id == lead_id)
    total = db.scalar(select(func.count()).select_from(base.subquery()))
    items = list(
        db.scalars(
            base.order_by(LeadActivity.created_at.desc()).offset(skip).limit(limit)
        ).all()
    )
    return total or 0, items


def create_activity(
    db: Session,
    lead_id: int,
    activity_type: str,
    note: str | None = None,
    old_status: LeadStatus | None = None,
    new_status: LeadStatus | None = None,
) -> LeadActivity:
    activity = LeadActivity(
        lead_id=lead_id,
        activity_type=activity_type,
        old_status=old_status,
        new_status=new_status,
        note=note,
    )
    db.add(activity)
    db.commit()
    db.refresh(activity)
    return activity


# ── Stats ─────────────────────────────────────────────────────────────────────

def get_lead_stats(db: Session) -> dict:
    total = db.scalar(select(func.count()).select_from(Lead)) or 0

    status_rows = db.execute(
        select(Lead.status, func.count(Lead.id)).group_by(Lead.status)
    ).all()

    source_rows = db.execute(
        select(Lead.source, func.count(Lead.id)).group_by(Lead.source)
    ).all()

    by_status = {row[0].value: row[1] for row in status_rows}
    by_source = {row[0].value: row[1] for row in source_rows}

    won_count = by_status.get("won", 0)
    conversion_rate = round((won_count / total) * 100, 2) if total > 0 else 0.0

    return {
        "total_leads": total,
        "by_status": by_status,
        "by_source": by_source,
        "conversion_rate": conversion_rate,
    }
