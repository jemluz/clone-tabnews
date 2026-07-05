import database from "../../../../infra/database.js";

function status(req, res) {
  res.status(200).json({ message: "olha essa API aqui HEIN HEIN" });
}

export default status;
