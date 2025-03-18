const prisma = require("../db/client");
const asyncHandler = require("express-async-handler");
const { validationResult, body, param } = require("express-validator");

const cloudinary = require("../utils/cloudinary");
const multer = require("multer");
const memoryStorage = multer.memoryStorage();
const upload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 5242880, // 5 MiB to bytes
  },
  fileFilter: (req, file, cb) => {
    const types = [
      "image/avif",
      "image/jpeg",
      "image/png",
      "image/svg+xml",
      "image/webp",
    ];

    if (!types.includes(file.mimetype)) return cb(null, false);

    cb(null, true);
  },
});

const validateProfile = () => [
  body("displayName")
    .trim()
    .isLength({ min: 1, max: 20 })
    .withMessage("Display name must be between 1 and 20 characters long.")
    .custom(async (display_name) => {
      const result = await prisma.profile.findUnique({
        where: {
          display_name,
        },
      });

      if (result) throw false;
    })
    .withMessage("Display name already exists."),
  body("bio")
    .trim()
    .isLength({ max: 190 })
    .withMessage("Bio must not exceed 190 characters."),
];

const validateUserId = () =>
  param("userId")
    .trim()
    .custom(async (userId) => {
      if (isNaN(Number(userId))) throw new Error("Parameter must be a number.");

      const user = await prisma.user.findUnique({
        where: {
          id: Number(userId),
        },
      });
      if (!user) throw new Error("User not found.");
    });

const updateProfile = [
  validateProfile(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    await prisma.profile.update({
      where: {
        user_id: req.user.id,
      },
      data: {
        display_name: req.body.displayName,
        bio: req.body.bio,
      },
    });

    res.json({ status: 200 });
  }),
];

const updatePicture = [
  upload.single("picture"),
  asyncHandler(async (req, res) => {
    if (!req.file)
      return res.status(400).json({
        errors: [{ msg: "Invalid file value." }],
      });

    await cloudinary.uploadImage(
      `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`,
      req.user.id,
    );

    await prisma.profile.update({
      where: {
        user_id: req.user.id,
      },
      data: {
        default_picture: false,
      },
    });

    res.json({ status: 200 });
  }),
];

const getProfile = [
  validateUserId(),
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const userId = Number(req.params.userId);

    const profile = (
      await prisma.$queryRaw`
      SELECT default_picture, display_name AS "displayName", bio
      FROM "Profile"
      WHERE user_id = ${userId}
    `
    )[0];
    if (profile.default_picture)
      profile.picture = cloudinary.generateUrl(process.env.DEFAULT_PFP);
    else profile.picture = cloudinary.generateUrl(userId);

    const friend = await prisma.$queryRaw`
      SELECT *
      FROM "Friend"
      WHERE friendship_id IN (
        SELECT friendship_id
        FROM "Friend"
        WHERE user_id = ${req.user.id}
      ) AND user_id = ${userId};
    `;
    if (req.user.id !== userId && friend.length === 0) {
      const mutuals = await prisma.$queryRaw`
        SELECT display_name AS "displayName", user_id AS "id"
        FROM "Profile"
        WHERE user_id IN (
          SELECT user_id
          FROM "Friend"
          WHERE user_id != ${req.user.id} AND friendship_id IN (
            SELECT friendship_id
            FROM "Friend"
            WHERE user_id = ${req.user.id} AND friendship_id IN (
              SELECT friendship_id
              FROM "Friend"
              WHERE user_id IN (
                SELECT user_id
                FROM "Friend"
                WHERE user_id != ${userId} AND friendship_id IN (
                  SELECT friendship_id
                  FROM "Friend"
                  WHERE user_id = ${userId}
                )
              )
            )
          )
        )
      `;

      profile.mutualFriends = mutuals;
    }

    delete profile.default_picture;
    res.json(profile);
  }),
];

// TODO: Add route for resetting profile picture

module.exports = {
  updateProfile,
  updatePicture,
  getProfile,
};
