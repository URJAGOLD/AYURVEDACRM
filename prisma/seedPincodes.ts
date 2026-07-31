// Loads a full India pincode -> district/state dataset into the Pincode table.
// Source: India Post pincode directory (public dataset), deduplicated to one row per pincode.
// Run with: npm run db:seed-pincodes
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

type Row = { pincode: string; place: string; district: string; state: string };

async function main() {
  const filePath = path.join(__dirname, "data", "pincodes.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  const rows: Row[] = JSON.parse(raw);

  console.log(`Loaded ${rows.length} pincodes from file. Writing to database...`);

  const batchSize = 2000;
  let written = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    await prisma.pincode.createMany({
      data: batch,
      skipDuplicates: true,
    });
    written += batch.length;
    console.log(`  ${Math.min(written, rows.length)} / ${rows.length}`);
  }

  console.log("Pincode seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
