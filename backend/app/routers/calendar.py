from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Batch, Medicine

router = APIRouter(tags=["calendar"])


@router.get("/calendar/events")
def expiry_events(month: str = Query(pattern=r"^\d{4}-\d{2}$"), db: Session = Depends(get_db)):
    try:
        start = date.fromisoformat(f"{month}-01")
    except ValueError as exc:
        raise HTTPException(422, "month must be a valid YYYY-MM value") from exc
    end = date(start.year + (1 if start.month == 12 else 0), start.month % 12 + 1, 1)
    rows = db.execute(select(Batch.id, Medicine.name, Batch.batch_no, Batch.expiry_date, Batch.quantity)
        .join(Medicine, Medicine.id == Batch.medicine_id)
        .where(Batch.quantity > 0, Batch.expiry_date >= start, Batch.expiry_date < end)
        .order_by(Batch.expiry_date, Medicine.name)).all()
    return [{"id": r.id, "medicine": r.name, "batch_no": r.batch_no,
        "date": r.expiry_date.isoformat(), "quantity": r.quantity} for r in rows]
