from datetime import datetime
from pydantic import BaseModel, EmailStr, ConfigDict
from app.models import LeadStatus, LeadSource


# ── Lead schemas ──────────────────────────────────────────────────────────────

class LeadCreate(BaseModel):
    name: str
    email: EmailStr
    phone: str | None = None
    company: str | None = None
    status: LeadStatus = LeadStatus.new
    source: LeadSource
    notes: str | None = None


class LeadUpdate(BaseModel):
    # All fields optional — only provided fields are applied to the record
    # status and source are intentionally excluded:
    #   - status has its own PATCH endpoint that also logs an activity
    #   - source should not change after a lead is created
    name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    company: str | None = None
    notes: str | None = None
    model_config = ConfigDict(extra="ignore")


class LeadStatusUpdate(BaseModel):
    status: LeadStatus
    note: str | None = None  # stored in the activity log entry


class LeadResponse(BaseModel):
    id: int
    name: str
    email: str
    phone: str | None
    company: str | None
    status: LeadStatus
    source: LeadSource
    notes: str | None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class LeadListResponse(BaseModel):
    total: int
    skip: int
    limit: int
    items: list[LeadResponse]


# ── Activity schemas ──────────────────────────────────────────────────────────

class LeadActivityCreate(BaseModel):
    note: str  # required — a manually-added note must have content


class LeadActivityResponse(BaseModel):
    id: int
    lead_id: int
    activity_type: str
    old_status: LeadStatus | None
    new_status: LeadStatus | None
    note: str | None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ActivityListResponse(BaseModel):
    lead_id: int
    total: int
    items: list[LeadActivityResponse]


# ── Stats schema ──────────────────────────────────────────────────────────────

class LeadStats(BaseModel):
    total_leads: int
    by_status: dict[str, int]
    by_source: dict[str, int]
    conversion_rate: float
