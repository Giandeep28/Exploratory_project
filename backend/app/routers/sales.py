from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Medicine, Sale, SaleItem
from app.schemas import SaleIn, SaleOut
from app.services.inventory import sell_from_batches

router = APIRouter(tags=["sales"])


@router.post("/sales", response_model=SaleOut, status_code=201)
def create_sale(payload: SaleIn, db: Session = Depends(get_db)):
    sale = Sale(invoice_no=f"INV-{uuid4().hex[:12].upper()}", total_amount=0)
    db.add(sale)
    total = 0.0
    try:
        for line in payload.items:
            medicine = db.get(Medicine, line.medicine_id)
            if not medicine:
                raise ValueError(f"Medicine {line.medicine_id} not found")
            sell_from_batches(db, medicine.id, line.quantity)
            price = float(medicine.price)
            sale.items.append(SaleItem(medicine_id=medicine.id, quantity=line.quantity, unit_price=price))
            total += price * line.quantity
        sale.total_amount = total
        db.commit()
    except ValueError as exc:
        db.rollback()
        raise HTTPException(409, str(exc)) from exc
    db.refresh(sale)
    return sale
