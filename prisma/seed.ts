/** Seed: super admin (from .env), Indian states, sample districts, sources, dealers, demo orders.
 *  Run:  npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { buildOrderCode } from "../src/lib/excel";

const prisma = new PrismaClient();

const STATES = [
  {id:1,name:"Andhra Pradesh"},{id:2,name:"Arunachal Pradesh"},{id:3,name:"Assam"},{id:4,name:"Bihar"},
  {id:5,name:"Chhattisgarh"},{id:6,name:"Goa"},{id:7,name:"Gujarat"},{id:8,name:"Haryana"},
  {id:9,name:"Himachal Pradesh"},{id:10,name:"Jharkhand"},{id:11,name:"Karnataka"},{id:12,name:"Kerala"},
  {id:13,name:"Madhya Pradesh"},{id:14,name:"Maharashtra"},{id:15,name:"Manipur"},{id:16,name:"Meghalaya"},
  {id:17,name:"Mizoram"},{id:18,name:"Nagaland"},{id:19,name:"Odisha"},{id:20,name:"Punjab"},
  {id:21,name:"Rajasthan"},{id:22,name:"Sikkim"},{id:23,name:"Tamil Nadu"},{id:24,name:"Telangana"},
  {id:25,name:"Tripura"},{id:26,name:"Uttar Pradesh"},{id:27,name:"Uttarakhand"},{id:28,name:"West Bengal"},
  {id:29,name:"Andaman and Nicobar Islands"},{id:30,name:"Chandigarh"},
  {id:31,name:"Dadra and Nagar Haveli and Daman and Diu"},{id:32,name:"Delhi"},
  {id:33,name:"Jammu and Kashmir"},{id:34,name:"Ladakh"},{id:35,name:"Lakshadweep"},{id:36,name:"Puducherry"},
];
const DISTRICTS = [
  {id:2101,name:"Jaipur",stateId:21},{id:2102,name:"Ajmer",stateId:21},{id:2103,name:"Alwar",stateId:21},
  {id:2104,name:"Jodhpur",stateId:21},{id:3201,name:"New Delhi",stateId:32},{id:3202,name:"North Delhi",stateId:32},
  {id:3203,name:"South Delhi",stateId:32},{id:2001,name:"Amritsar",stateId:20},{id:2002,name:"Ludhiana",stateId:20},
  {id:1401,name:"Mumbai",stateId:14},{id:1402,name:"Pune",stateId:14},{id:2601,name:"Lucknow",stateId:26},
];
const SOURCES = ["Store 1","Store 2","IND","Delhi","Delhi Store","Pincode","Calling","IND MANDEEP","DELHI MANDEEP","WHATSAPP"];

async function main() {
  console.log("Seeding...");
  for (const s of STATES) await prisma.state.upsert({ where:{id:s.id}, update:{name:s.name}, create:s });
  for (const d of DISTRICTS) await prisma.district.upsert({ where:{id:d.id}, update:{name:d.name,stateId:d.stateId}, create:d });
  for (const name of SOURCES) await prisma.source.upsert({ where:{name}, update:{}, create:{name} });

  if ((await prisma.dealer.count()) === 0) {
    await prisma.dealer.createMany({ data:[
      {name:"Jaipur Hub",city:"Jaipur",stateId:21},
      {name:"Delhi Hub",city:"Delhi",stateId:32},
    ]});
  }

  const email = process.env.SUPERADMIN_EMAIL || "admin@amriayurveda.in";
  const password = process.env.SUPERADMIN_PASSWORD || "ChangeThisOnFirstLogin@123";
  const name = process.env.SUPERADMIN_NAME || "Super Admin";
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where:{email},
    update:{ role:"SUPER_ADMIN", isActive:true },
    create:{ name, email, passwordHash, role:"SUPER_ADMIN", isActive:true, mustChangePw:true },
  });
  console.log("SUPER_ADMIN:", email, "(password from .env)");

  if ((await prisma.order.count()) === 0) {
    const demo = [
      {customerName:"Anil Tapre",contactNumber:"9346326862",city:"Bhododa",stateId:24,pincode:"504309",source:"Pincode"},
      {customerName:"Rahul Verma",contactNumber:"9876543210",city:"Jaipur",stateId:21,districtId:2101,pincode:"302012",source:"IND"},
      {customerName:"Sunil Kumar",contactNumber:"9812345678",city:"Amritsar",stateId:20,districtId:2001,pincode:"143001",source:"WHATSAPP"},
    ];
    let seq = 349317;
    for (const d of demo as any[]) {
      await prisma.order.create({ data:{
        orderCode: buildOrderCode(seq++), customerName:d.customerName, contactNumber:d.contactNumber,
        productName:"Sutra Gold+", quantity:1, price:999, address:d.city, city:d.city,
        stateId:d.stateId, districtId:d.districtId, pincode:d.pincode, source:d.source,
        orderStatus:"New", paymentStatus:"Pending",
      }});
    }
  }
  console.log("Seed complete.");
}
main().catch(e=>{console.error(e);process.exit(1);}).finally(()=>prisma.$disconnect());