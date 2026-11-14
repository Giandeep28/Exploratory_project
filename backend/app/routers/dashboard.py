from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Batch, Medicine, Sale, SaleItem
from app.services.inventory import stock_rows

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard/summary")
def summary(expiry_window_days: int = Query(90, ge=0, le=365), db: Session = Depends(get_db)):
    today = date.today()
    stock = stock_rows(db)
    near = db.scalar(select(func.count(Batch.id)).where(Batch.quantity > 0,
        Batch.expiry_date >= today, Batch.expiry_date <= today + timedelta(days=expiry_window_days))) or 0
    expired = db.scalar(select(func.count(Batch.id)).where(Batch.quantity > 0, Batch.expiry_date < today)) or 0
    sales_total = db.scalar(select(func.coalesce(func.sum(Sale.total_amount), 0)).where(
        Sale.sold_at >= datetime.now() - timedelta(days=30))) or 0
    return {"medicine_count": len(stock), "low_stock_count": sum(x["low_stock"] for x in stock),
            "near_expiry_batches": near, "expired_batches": expired,
            "sales_last_30_days": float(sales_total)}


@router.get("/reports/top-medicines")
def top_medicines(days: int = Query(30, ge=1, le=3650), db: Session = Depends(get_db)):
    rows = db.execute(select(Medicine.id, Medicine.name, func.sum(SaleItem.quantity).label("units"))
        .join(SaleItem, SaleItem.medicine_id == Medicine.id).join(Sale)
        .where(Sale.sold_at >= datetime.now() - timedelta(days=days))
        .group_by(Medicine.id, Medicine.name).order_by(func.sum(SaleItem.quantity).desc()).limit(5)).all()
    return [{"medicine_id": r.id, "name": r.name, "units": int(r.units)} for r in rows]


@router.get("/forecast/{medicine_id}")
def forecast(medicine_id: int, db: Session = Depends(get_db)):
    medicine = db.get(Medicine, medicine_id)
    if not medicine:
        raise HTTPException(404, "Medicine not found")
    since = datetime.now() - timedelta(days=14)
    units = db.scalar(select(func.coalesce(func.sum(SaleItem.quantity), 0))
        .join(Sale, Sale.id == SaleItem.sale_id)
        .where(SaleItem.medicine_id == medicine_id, Sale.sold_at >= since)) or 0
    average_daily = float(units) / 14
    demand = round(average_daily * 30)
    current_stock = sum(row["quantity"] for row in stock_rows(db) if row["id"] == medicine_id)
    return {"medicine_id": medicine_id, "method": "14-day average", "avg_daily_units": round(average_daily, 2),
        "forecast_30_day_units": demand, "current_stock": current_stock,
        "suggested_reorder_units": max(0, demand + medicine.threshold_qty - current_stock)}
