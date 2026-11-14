from datetime import date
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models import Batch, Medicine


def available_quantity(db: Session, medicine_id: int) -> int:
    return db.scalar(select(func.coalesce(func.sum(Batch.quantity), 0)).where(
        Batch.medicine_id == medicine_id, Batch.expiry_date >= date.today())) or 0


def stock_rows(db: Session):
    valid_qty = func.coalesce(func.sum(case((Batch.expiry_date >= date.today(), Batch.quantity), else_=0)), 0)
    rows = db.execute(select(Medicine, valid_qty)
                      .outerjoin(Batch).group_by(Medicine.id).order_by(Medicine.name)).all()
    return [{"id": m.id, "name": m.name, "company": m.company, "price": float(m.price),
             "threshold_qty": m.threshold_qty, "quantity": int(qty),
             "low_stock": int(qty) < m.threshold_qty} for m, qty in rows]


def sell_from_batches(db: Session, medicine_id: int, quantity: int) -> None:
    batches = db.scalars(select(Batch).where(Batch.medicine_id == medicine_id,
        Batch.quantity > 0, Batch.expiry_date >= date.today()).order_by(Batch.expiry_date)
        .with_for_update()).all()
    available = sum(b.quantity for b in batches)
    if available < quantity:
        raise ValueError(f"Insufficient unexpired stock: {available} available")
    remaining = quantity
    for batch in batches:
        taken = min(batch.quantity, remaining)
        batch.quantity -= taken
        remaining -= taken
        if remaining == 0:
            break
