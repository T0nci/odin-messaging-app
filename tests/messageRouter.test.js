const app = require("../src/app");
const request = require("supertest")(app);
const prisma = require("../src/db/client");
const {
  jest: globalJest,
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
} = require("@jest/globals");
const { deleteFriends } = require("./data/cleanup");
const users = require("./data/users");

const path = require("node:path");
const cloudinary = require("../src/utils/cloudinary");
globalJest.mock("../src/utils/cloudinary");
cloudinary.uploadImageWithPublicId = globalJest.fn();
cloudinary.generateUrl = globalJest.fn();
cloudinary.deleteImage = globalJest.fn();

describe("messageRouter", () => {
  const sender = users.find((user) => user.username === "penny");
  const receiver = users.find((user) => user.username === "al1c3");

  beforeAll(async () => {
    const friendship = await prisma.friendship.create({
      data: {
        id: -1,
      },
    });
    await prisma.friend.createManyAndReturn({
      data: [
        {
          id: -1,
          friendship_id: friendship.id,
          user_id: sender.id,
        },
        {
          id: -2,
          friendship_id: friendship.id,
          user_id: receiver.id,
        },
      ],
    });
  });

  afterAll(async () => {
    await deleteFriends();
  });

  describe("POST /messages/:userId", () => {
    it("returns error if parameter isn't a number or is invalid", async () => {
      const login = await request
        .post("/login")
        .send({ username: "penny", password: "pen@5Apple" });

      const accessToken = login.header["set-cookie"]
        .find((cookie) => cookie.startsWith("access"))
        .split(";")[0];

      const response = await request
        .post("/messages/asd")
        .set("Cookie", [accessToken]);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Parameter must be a number.");
    });

    it("returns error if user is sending a message to self", async () => {
      const login = await request
        .post("/login")
        .send({ username: "penny", password: "pen@5Apple" });

      const accessToken = login.header["set-cookie"]
        .find((cookie) => cookie.startsWith("access"))
        .split(";")[0];

      const response = await request
        .post("/messages/" + users.find((user) => user.username === "penny").id)
        .set("Cookie", [accessToken]);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("ID must belong to other user.");
    });

    it("returns error if user is not friends with receiver", async () => {
      const login = await request
        .post("/login")
        .send({ username: "penny", password: "pen@5Apple" });

      const accessToken = login.header["set-cookie"]
        .find((cookie) => cookie.startsWith("access"))
        .split(";")[0];

      const response = await request
        .post("/messages/" + users.find((user) => user.username === "sam1").id)
        .set("Cookie", [accessToken]);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Friend not found.");
    });

    it("returns error if invalid type", async () => {
      const login = await request
        .post("/login")
        .send({ username: "penny", password: "pen@5Apple" });

      const accessToken = login.header["set-cookie"]
        .find((cookie) => cookie.startsWith("access"))
        .split(";")[0];

      const response = await request
        .post("/messages/" + receiver.id)
        .set("Cookie", [accessToken])
        .field("type", "blah");

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Unknown message type.");
    });

    it("returns error if no or invalid content", async () => {
      const login = await request
        .post("/login")
        .send({ username: "penny", password: "pen@5Apple" });

      const accessToken = login.header["set-cookie"]
        .find((cookie) => cookie.startsWith("access"))
        .split(";")[0];

      const response = await request
        .post("/messages/" + receiver.id)
        .set("Cookie", [accessToken])
        .field("type", "text");

      expect(response.status).toBe(400);
      expect(response.body.error).toBe(
        "Content must be at least 1 character long.",
      );
    });

    it("returns error if no or invalid image", async () => {
      const login = await request
        .post("/login")
        .send({ username: "penny", password: "pen@5Apple" });

      const accessToken = login.header["set-cookie"]
        .find((cookie) => cookie.startsWith("access"))
        .split(";")[0];

      const response = await request
        .post("/messages/" + receiver.id)
        .set("Cookie", [accessToken])
        .field("type", "image");

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Image must be provided.");
    });

    it("returns 200 for successful text message", async () => {
      const login = await request
        .post("/login")
        .send({ username: "penny", password: "pen@5Apple" });

      const accessToken = login.header["set-cookie"]
        .find((cookie) => cookie.startsWith("access"))
        .split(";")[0];

      const response = await request
        .post("/messages/" + receiver.id)
        .set("Cookie", [accessToken])
        .field("type", "text")
        .field("content", "test");

      const message = await prisma.message.findMany();
      await prisma.message.deleteMany(); // clean up

      expect(response.status).toBe(200);
      expect(response.body.status).toBe(200);
      expect(message.length).toBe(1);
      expect(message[0].from_id).toBe(sender.id);
      expect(message[0].to_id).toBe(receiver.id);
      expect(message[0].content).toBe("test");
      expect(message[0].type).toBe("TEXT");
      expect(message[0].id).toBeDefined();
      expect(message[0].date_sent).toBeDefined();
    });

    it("returns 200 for successful image message", async () => {
      cloudinary.uploadImageWithPublicId.mockResolvedValueOnce("some url");

      const login = await request
        .post("/login")
        .send({ username: "penny", password: "pen@5Apple" });

      const accessToken = login.header["set-cookie"]
        .find((cookie) => cookie.startsWith("access"))
        .split(";")[0];

      const response = await request
        .post("/messages/" + receiver.id)
        .set("Cookie", [accessToken])
        .field("type", "image")
        .attach("image", path.join(__dirname, "data/test.jpg"));

      const message = await prisma.message.findMany();
      await prisma.message.deleteMany(); // clean up

      expect(response.status).toBe(200);
      expect(response.body.status).toBe(200);
      expect(message.length).toBe(1);
      expect(message[0].from_id).toBe(sender.id);
      expect(message[0].to_id).toBe(receiver.id);
      expect(message[0].content).toBe("some url");
      expect(message[0].type).toBe("IMAGE");
      expect(message[0].id).toBeDefined();
      expect(message[0].date_sent).toBeDefined();
      expect(cloudinary.uploadImageWithPublicId).toBeCalledTimes(1);
    });
  });

  describe("GET /messages/:userId", () => {
    it("returns error if parameter isn't a number or is invalid", async () => {
      const login = await request
        .post("/login")
        .send({ username: "penny", password: "pen@5Apple" });

      const accessToken = login.header["set-cookie"]
        .find((cookie) => cookie.startsWith("access"))
        .split(";")[0];

      const response = await request
        .get("/messages/asd")
        .set("Cookie", [accessToken]);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Parameter must be a number.");
    });

    it("returns error if user is getting messages from self", async () => {
      const login = await request
        .post("/login")
        .send({ username: "penny", password: "pen@5Apple" });

      const accessToken = login.header["set-cookie"]
        .find((cookie) => cookie.startsWith("access"))
        .split(";")[0];

      const response = await request
        .get("/messages/" + users.find((user) => user.username === "penny").id)
        .set("Cookie", [accessToken]);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("ID must belong to other user.");
    });

    it("returns error if user doesn't have any messages with other user", async () => {
      const login = await request
        .post("/login")
        .send({ username: "penny", password: "pen@5Apple" });

      const accessToken = login.header["set-cookie"]
        .find((cookie) => cookie.startsWith("access"))
        .split(";")[0];

      const response = await request
        .get("/messages/" + users.find((user) => user.username === "sam1").id)
        .set("Cookie", [accessToken]);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("No messages found.");
    });

    it("returns all messages with other user", async () => {
      cloudinary.generateUrl.mockReset();
      cloudinary.generateUrl.mockReturnValueOnce("some url");

      await prisma.message.createMany({
        data: [
          {
            id: -1,
            content: "test",
            type: "TEXT",
            from_id: sender.id,
            to_id: receiver.id,
          },
          {
            id: -2,
            content: "some url",
            type: "IMAGE",
            from_id: receiver.id,
            to_id: sender.id,
          },
        ],
      });

      const login = await request
        .post("/login")
        .send({ username: "penny", password: "pen@5Apple" });

      const accessToken = login.header["set-cookie"]
        .find((cookie) => cookie.startsWith("access"))
        .split(";")[0];

      const response = await request
        .get("/messages/" + receiver.id)
        .set("Cookie", [accessToken]);

      await prisma.message.deleteMany(); // clean up

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(2);
      expect(cloudinary.generateUrl).toBeCalledTimes(1);
      expect(response.body[0].content).toBe("test");
      expect(response.body[0].type).toBe("text");
      expect(response.body[0].me).toBe(true);
      expect(response.body[0].dateSent).toBeDefined();
      expect(response.body[0].id).toBeDefined();
      expect(response.body[1].content).toBe("some url");
      expect(response.body[1].type).toBe("image");
      expect(response.body[1].me).toBe(false);
      expect(response.body[1].dateSent).toBeDefined();
      expect(response.body[1].id).toBeDefined();
    });
  });

  describe("GET /messages/", () => {
    it("returns all messages with other user", async () => {
      cloudinary.generateUrl.mockReset();
      cloudinary.generateUrl.mockReturnValueOnce("some url");
      cloudinary.generateUrl.mockReturnValueOnce("some url");

      await prisma.message.createMany({
        data: [
          {
            id: -1,
            content: "test",
            type: "TEXT",
            from_id: sender.id,
            to_id: receiver.id,
            date_sent: "2000-01-01T00:00:00Z",
          },
          {
            id: -2,
            content: "some url",
            type: "IMAGE",
            from_id: receiver.id,
            to_id: sender.id,
            date_sent: "2020-01-01T00:00:00Z",
          },
        ],
      });

      const login = await request
        .post("/login")
        .send({ username: "penny", password: "pen@5Apple" });

      const accessToken = login.header["set-cookie"]
        .find((cookie) => cookie.startsWith("access"))
        .split(";")[0];

      const response = await request
        .get("/messages/")
        .set("Cookie", [accessToken]);

      await prisma.message.deleteMany(); // clean up

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(1);
      expect(cloudinary.generateUrl).toBeCalledTimes(2);

      expect(response.body[0].id).toBe(receiver.id);
      expect(response.body[0].displayName).toBe(
        receiver.profile.create.display_name,
      );
      expect(response.body[0].picture).toBe("some url");

      expect(response.body[0].message.id).toBeDefined();
      expect(response.body[0].message.content).toBe("some url");
      expect(response.body[0].message.dateSent).toBeDefined();
      expect(response.body[0].message.type).toBe("image");
      expect(response.body[0].message.me).toBe(false);
    });
  });

  describe("DELETE /messages/:messageId", () => {
    it("returns error if parameter isn't a number or is invalid", async () => {
      const login = await request
        .post("/login")
        .send({ username: "penny", password: "pen@5Apple" });

      const accessToken = login.header["set-cookie"]
        .find((cookie) => cookie.startsWith("access"))
        .split(";")[0];

      const response = await request
        .delete("/messages/asd")
        .set("Cookie", [accessToken]);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Parameter must be a number.");
    });

    it("returns error if message not found or message is deleted", async () => {
      const login = await request
        .post("/login")
        .send({ username: "penny", password: "pen@5Apple" });

      const accessToken = login.header["set-cookie"]
        .find((cookie) => cookie.startsWith("access"))
        .split(";")[0];

      const response = await request
        .delete("/messages/123")
        .set("Cookie", [accessToken]);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Message not found.");
    });

    it("deletes text message", async () => {
      const message = await prisma.message.create({
        data: {
          id: -1,
          content: "test",
          type: "TEXT",
          from_id: sender.id,
          to_id: receiver.id,
        },
      });

      const login = await request
        .post("/login")
        .send({ username: "penny", password: "pen@5Apple" });

      const accessToken = login.header["set-cookie"]
        .find((cookie) => cookie.startsWith("access"))
        .split(";")[0];

      const response = await request
        .delete("/messages/" + message.id)
        .set("Cookie", [accessToken]);

      const messages = await prisma.message.findMany();
      await prisma.message.deleteMany(); // cleanup

      expect(response.status).toBe(200);
      expect(response.body.status).toBe(200);
      expect(messages[0].content).toBe("");
      expect(messages[0].type).toBe("DELETED");
    });

    it("deletes image message", async () => {
      cloudinary.deleteImage.mockReset();

      const message = await prisma.message.create({
        data: {
          id: -1,
          content: "some url",
          type: "IMAGE",
          from_id: sender.id,
          to_id: receiver.id,
        },
      });

      const login = await request
        .post("/login")
        .send({ username: "penny", password: "pen@5Apple" });

      const accessToken = login.header["set-cookie"]
        .find((cookie) => cookie.startsWith("access"))
        .split(";")[0];

      const response = await request
        .delete("/messages/" + message.id)
        .set("Cookie", [accessToken]);

      const messages = await prisma.message.findMany();
      await prisma.message.deleteMany(); // cleanup

      expect(response.status).toBe(200);
      expect(response.body.status).toBe(200);
      expect(messages[0].content).toBe("");
      expect(messages[0].type).toBe("DELETED");
      expect(cloudinary.deleteImage).toBeCalledTimes(1);
    });
  });
});
