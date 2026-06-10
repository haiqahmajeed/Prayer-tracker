from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import crud
from app.database import get_db
from app.models import LeadStatus, LeadSource
from app.schemas import (
    LeadCreate,
    LeadUpdate,
    LeadStatusUpdate,
    LeadResponse,
    LeadListResponse,
    LeadActivityCreate,
    LeadActivityResponse,
    ActivityListResponse,
    LeadStats,
)

router = APIRouter(tags=["leads"])


# ── Stats ─────────────────────────────────────────────────────────────────────
# IMPORTANT: this route must be declared before GET /{lead_id}.
# FastAPI matches routes top-to-bottom; if /{lead_id} came first, FastAPI would
# try to parse the literal string "stats" as an integer and return a 422 error.

@router.get("/stats", response_model=LeadStats)
def get_stats(db: Session = Depends(get_db)):
    return crud.get_lead_stats(db)


# ── Lead CRUD ─────────────────────────────────────────────────────────────────

@router.post("/", response_model=LeadResponse, status_code=201)
def create_lead(lead_in: LeadCreate, db: Session = Depends(get_db)):
    if crud.get_lead_by_email(db, lead_in.email):
        raise HTTPException(status_code=409, detail="A lead with this email already exists")
    return crud.create_lead(db, lead_in)


@router.get("/", response_model=LeadListResponse)
def list_leads(
    status: LeadStatus | None = Query(default=None),
    source: LeadSource | None = Query(default=None),
    search: str | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    sort_by: str = Query(default="created_at", pattern="^(created_at|updated_at|name)$"),
    sort_order: str = Query(default="desc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
):
    total, items = crud.get_leads(db, status, source, search, skip, limit, sort_by, sort_order)
    return LeadListResponse(total=total, skip=skip, limit=limit, items=items)


@router.get("/{lead_id}", response_model=LeadResponse)
def get_lead(lead_id: int, db: Session = Depends(get_db)):
    lead = crud.get_lead(db, lead_id)
    if lead is None:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead


@router.put("/{lead_id}", response_model=LeadResponse)
def update_lead(lead_id: int, update_data: LeadUpdate, db: Session = Depends(get_db)):
    lead = crud.get_lead(db, lead_id)
    if lead is None:
        raise HTTPException(status_code=404, detail="Lead not found")
    if update_data.email and update_data.email != lead.email:
        if crud.get_lead_by_email(db, update_data.email):
            raise HTTPException(status_code=409, detail="A lead with this email already exists")
    return crud.update_lead(db, lead, update_data)


@router.delete("/{lead_id}", status_code=204)
def delete_lead(lead_id: int, db: Session = Depends(get_db)):
    lead = crud.get_lead(db, lead_id)
    if lead is None:
        raise HTTPException(status_code=404, detail="Lead not found")
    crud.delete_lead(db, lead)


# ── Status update ─────────────────────────────────────────────────────────────

@router.patch("/{lead_id}/status", response_model=LeadResponse)
def update_lead_status(
    lead_id: int,
    status_update: LeadStatusUpdate,
    db: Session = Depends(get_db),
):
    lead = crud.get_lead(db, lead_id)
    if lead is None:
        raise HTTPException(status_code=404, detail="Lead not found")
    if lead.status == status_update.status:
        raise HTTPException(status_code=400, detail="Lead is already in that status")
    return crud.update_lead_status(db, lead, status_update.status, status_update.note)


# ── Activity log ──────────────────────────────────────────────────────────────

@router.get("/{lead_id}/activities", response_model=ActivityListResponse)
def list_activities(
    lead_id: int,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
):
    if crud.get_lead(db, lead_id) is None:
        raise HTTPException(status_code=404, detail="Lead not found")
    total, items = crud.get_activities_for_lead(db, lead_id, skip, limit)
    return ActivityListResponse(lead_id=lead_id, total=total, items=items)


@router.post("/{lead_id}/activities", response_model=LeadActivityResponse, status_code=201)
def add_activity_note(
    lead_id: int,
    activity_in: LeadActivityCreate,
    db: Session = Depends(get_db),
):
    if crud.get_lead(db, lead_id) is None:
        raise HTTPException(status_code=404, detail="Lead not found")
    return crud.create_activity(db, lead_id, activity_type="note_added", note=activity_in.note)
