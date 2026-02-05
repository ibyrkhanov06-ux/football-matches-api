const express = require("express");
const { ObjectId } = require("mongodb");
const auth = require("../middleware/auth");

const router = express.Router();

module.exports = (items) => {

    // GET all items (PUBLIC)
    router.get("/", async (req, res) => {
        const data = await items.find().toArray();
        res.json(data);
    });

    // GET item by id (PUBLIC)
    router.get("/:id", async (req, res) => {
        try {
            const item = await items.findOne({ _id: new ObjectId(req.params.id) });

            if (!item) {
                return res.status(404).json({ message: "Item not found" });
            }

            res.json(item);
        } catch (err) {
            res.status(400).json({ message: "Invalid ID" });
        }
    });

    // CREATE item (PROTECTED)
    router.post("/", auth, async (req, res) => {
        const { name, price } = req.body;

        if (!name || price == null) {
            return res.status(400).json({ message: "name and price required" });
        }

        const result = await items.insertOne({ name, price });
        res.status(201).json({ id: result.insertedId });
    });

    // FULL UPDATE item (PROTECTED)
    router.put("/:id", auth, async (req, res) => {
        const { name, price } = req.body;

        if (!name || price == null) {
            return res.status(400).json({ message: "name and price required" });
        }

        const result = await items.updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { name, price } }
        );

        if (!result.matchedCount) {
            return res.status(404).json({ message: "Item not found" });
        }

        res.json({ message: "Item updated" });
    });

    // PARTIAL UPDATE item (PROTECTED)
    router.patch("/:id", auth, async (req, res) => {
        const result = await items.updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: req.body }
        );

        if (!result.matchedCount) {
            return res.status(404).json({ message: "Item not found" });
        }

        res.json({ message: "Item updated" });
    });

    // DELETE item (PROTECTED)
    router.delete("/:id", auth, async (req, res) => {
        const result = await items.deleteOne({
            _id: new ObjectId(req.params.id),
        });

        if (!result.deletedCount) {
            return res.status(404).json({ message: "Item not found" });
        }

        res.status(204).end();
    });

    return router;
};
