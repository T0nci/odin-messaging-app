const profileController = require("../controllers/profileController");
const { Router } = require("express");

const profileRouter = Router();

profileRouter.put("/", profileController.updateProfile);
profileRouter.put("/picture", profileController.updatePicture);
profileRouter.get("/:userId", profileController.getProfile);
profileRouter.delete("/picture", profileController.deletePicture);

module.exports = profileRouter;
