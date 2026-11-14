from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Batch, Medicine
from app.schemas import BatchIn, BatchOut, MedicineIn, MedicineOut
from app.services.inventory import stock_rows

router = APIRouter(tags=["inventory"])


@router.get("/medicines", response_model=list[MedicineOut])
def list_medicines(db: Session = Depends(get_db)):
    return db.scalars(select(Medicine).order_by(Medicine.name)).all()


@router.get("/medicines/barcode/{barcode}", response_model=MedicineOut)
def find_barcode(barcode: str, db: Session = Depends(get_db)):
    medicine = db.scalar(select(Medicine).where(Medicine.barcode == barcode))
    if not medicine:
        raise HTTPException(404, "Barcode not found")
    return medicine


@router.post("/medicines", response_model=MedicineOut, status_code=201)
def create_medicine(payload: MedicineIn, db: Session = Depends(get_db)):
    medicine = Medicine(**payload.model_dump())
    db.add(medicine)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Medicine name or barcode already exists") from exc
    db.refresh(medicine)
    return medicine


@router.patch("/medicines/{medicine_id}/threshold")
def set_threshold(medicine_id: int, threshold_qty: int = Query(ge=0), db: Session = Depends(get_db)):
    medicine = db.get(Medicine, medicine_id)
    if not medicine:
        raise HTTPException(404, "Medicine not found")
    medicine.threshold_qty = threshold_qty
    db.commit()
    return {"id": medicine.id, "threshold_qty": medicine.threshold_qty}


@router.get("/stock")
def get_stock(db: Session = Depends(get_db)):
    return stock_rows(db)


@router.post("/batches", response_model=BatchOut, status_code=201)
def receive_batch(payload: BatchIn, db: Session = Depends(get_db)):
    if not db.get(Medicine, payload.medicine_id):
        raise HTTPException(404, "Medicine not found")
    if payload.manufacturing_date and payload.manufacturing_date > payload.expiry_date:
        raise HTTPException(422, "Manufacturing date must precede expiry date")
    batch = Batch(**payload.model_dump())
    db.add(batch)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Batch number already exists for this medicine") from exc
    db.refresh(batch)
    return batch
