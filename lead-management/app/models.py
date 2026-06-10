import enum
from datetime import datetime
from sqlalchemy import String, Text, ForeignKey, Enum as SAEnum, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class LeadStatus(str, enum.Enum):
    new = "new"
    contacted = "contacted"
    qualified = "qualified"
    proposal_sent = "proposal_sent"
    won = "won"
    lost = "lost"


class LeadSource(str, enum.Enum):
    website = "website"
    referral = "referral"
    cold_outreach = "cold_outreach"
    social_media = "social_media"
    event = "event"
    other = "other"


class Lead(Base):
    __tablename__ = "leads"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    company: Mapped[str | None] = mapped_column(String(200), nullable=True)
    status: Mapped[LeadStatus] = mapped_column(
        SAEnum(LeadStatus, name="leadstatus", create_type=True),
        nullable=False,
        default=LeadStatus.new,
        index=True,
    )
    source: Mapped[LeadSource] = mapped_column(
        SAEnum(LeadSource, name="leadsource", create_type=True),
        nullable=False,
        index=True,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        nullable=False,
        server_default=func.now(),
        index=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    activities: Mapped[list["LeadActivity"]] = relationship(
        back_populates="lead", cascade="all, delete-orphan"
    )


class LeadActivity(Base):
    __tablename__ = "lead_activities"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    lead_id: Mapped[int] = mapped_column(
        ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    activity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    # create_type=False because the "leadstatus" PG type is already declared above on Lead.status
    old_status: Mapped[LeadStatus | None] = mapped_column(
        SAEnum(LeadStatus, name="leadstatus", create_type=False), nullable=True
    )
    new_status: Mapped[LeadStatus | None] = mapped_column(
        SAEnum(LeadStatus, name="leadstatus", create_type=False), nullable=True
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now(), index=True
    )

    lead: Mapped["Lead"] = relationship(back_populates="activities")
