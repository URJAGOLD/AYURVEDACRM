"use client";
import { useParams } from "next/navigation";
import { OrderForm } from "@/components/orders/OrderForm";
export default function Page() { const p = useParams(); return <OrderForm orderId={(p as any)?.id} />; }