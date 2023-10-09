const express = require("express");
const session = require("express-session");
const OracleSessionStore = require("../index.js");
const db = require("./test_db");
const expect = require("chai").expect;
const request = require("supertest");

describe("express-session", function () {
  beforeEach(async function () {
    this.timeout(10000);
    try {
      await db.disconnect();
    } catch {}
    await db.connect();
  });

  it("should be included into session", function (done) {
    this.timeout(30000);
    const store = new OracleSessionStore({ pool: db.get() });
    const server = mockServer(store);
    lifecycleTest(server).then(done).catch(done);
  });
});

function mockServer(store) {
  const app = express();
  app.use(
    session({
      store,
      secret: "test",
      resave: true,
      saveUninitialized: true,
    })
  );

  app.get("/", function (req, res) {
    if (!req.session.views) {
      req.session.views = 1;
    } else {
      req.session.views++;
    }

    return res.send({
      views: req.session.views,
      id: req.sessionID,
    });
  });

  app.post("/", function (req, res) {
    return req.session.destroy((err) => {
      if (err) {
        return res.status(400).statusMessage(err.message).end();
      }

      return res.status(200).end();
    });
  });
  return app;
}

async function lifecycleTest(server) {
  const response = await request(server).post("/");
  expect(response.status).to.equal(200);
  expect(response.headers["set-cookie"]).to.not.exist;

  const response2 = await request(server)
    .get("/")
    .set("content-type", "application/json");
  expect(response2.status).to.equal(200);
  expect(response2.body).to.exist;
  expect(response2.body.views).to.equal(1);
  expect(response2.headers["set-cookie"]).to.exist;
  expect(response2.headers["set-cookie"][0]).to.match(/^connect\.sid/);

  const response3 = await request(server)
    .get("/")
    .set("content-type", "application/json")
    .set("cookie", response2.headers['set-cookie']);
  expect(response3.status).to.equal(200);
  expect(response3.body).to.exist;
  expect(response3.body.views).to.equal(2);
  expect(response3.body.sessionID).to.equal(response2.body.sessionID);
  return ;
}
