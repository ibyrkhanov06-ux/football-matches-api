require("dotenv").config();
const { MongoClient } = require("mongodb");
const bcrypt = require("bcrypt");

async function run() {
  const uri = process.env.MONGO_URI || "mongodb://localhost:27017";
  const client = new MongoClient(uri);

  await client.connect();
  const db = client.db("football");
  const users = db.collection("users");

  const email = "admin@mail.com";
  const password = "Admin123!";
  const role = "organizer";

  const exists = await users.findOne({ email });
  if (exists) {
    console.log("User already exists:", email);
    return process.exit(0);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await users.insertOne({
    email,
    passwordHash,
    role,               // organizer / participant
    createdAt: new Date()
  });

  console.log("Seeded user:", { email, password, role });
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
