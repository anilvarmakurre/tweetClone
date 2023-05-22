const express = require("express");
const app = express();

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const jwt = require("jsonwebtoken");

const bcrypt = require("bcrypt");

const dbPath = path.join(__dirname, "twitterClone.db");
app.use(express.json());

let database = null;

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running....");
    });
  } catch (error) {
    console.log(`error message '${error.message}'`);
    process.exit(1);
  }
};

initializeDbAndServer();

const tokenValidating = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

const getUserId = async (request, response, next) => {
  const { username } = request;
  console.log(username);
  const getUser = `SELECT user_id FROM user WHERE username='${username}';`;
  const userId = await database.get(getUser);
  const { user_id } = userId;
  request.user_id = user_id;

  next();
};

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  console.log(username);
  const hashPassword = await bcrypt.hash(request.body.password, 10);
  const checkUser = `SELECT user_id FROM user Where username='${username}';`;
  const dbUser = await database.get(checkUser);
  console.log(dbUser);
  if (dbUser === undefined) {
    if (password.length > 6) {
      const getQuery = `INSERT INTO user(username,password,name,gender)
            values('${username}','${hashPassword}','${name}','${gender}');`;
      const getResponse = await database.run(getQuery);
      response.status(200);
      //   console.log(getResponse);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkUser = `
    SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await database.get(checkUser);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
        // user_id: user_id,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      console.log(jwtToken);
      response.status(200);
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get(
  "/user/tweets/feed/",
  tokenValidating,
  getUserId,
  async (request, response) => {
    const { user_id } = request;
    console.log(user_id);
    const getQuery = `
SELECT
user.username, tweet.tweet, tweet.date_time AS dateTime
FROM
follower
INNER JOIN tweet
ON follower.following_user_id = tweet.user_id
INNER JOIN user
ON tweet.user_id = user.user_id
WHERE
follower.follower_user_id = ${user_id}
ORDER BY
tweet.date_time DESC
LIMIT 4;`;
    const getResponse = await database.all(getQuery);
    response.status(200);
    response.send(getResponse);
  }
);

app.get(
  "/user/following/",
  tokenValidating,
  getUserId,
  async (request, response) => {
    const { user_id } = request;
    const getQuery = `SELECT user.name as name FROM user INNER JOIN follower
    ON user.user_id=follower.following_user_id
    WHERE follower.follower_user_id='${user_id}';`;
    const getResponse = await database.all(getQuery);
    response.status(200);
    response.send(getResponse);
  }
);

app.get(
  "/user/followers/",
  tokenValidating,
  getUserId,
  async (request, response) => {
    const { user_id } = request;
    const getQuery = `SELECT user.name as name FROM user INNER JOIN follower
    ON user.user_id=follower.follower_user_id
    WHERE follower.following_user_id='${user_id}';`;
    const getResponse = await database.all(getQuery);
    response.status(200);
    response.send(getResponse);
  }
);

app.get(
  "/tweets/:tweetId/",
  tokenValidating,
  getUserId,
  async (request, response) => {
    const { tweetId } = request.params;
    console.log(`${tweetId} abn`);
    const { user_id } = request;
    console.log(user_id);
    const getUser = `SELECT user_id FROM tweet WHERE tweet_id='${tweetId}';`;
    const dbUser = await database.get(getUser);
    console.log(dbUser.user_id, user_id);
    if (dbUser.user_id !== user_id) {
      response.status(400);
      response.send("Invalid Request");
    } else {
      const getQuery = `SELECT tweet.tweet,count(like.like_id) as likes,count(reply.reply_id) as replies,
        tweet.date_time as dateTime FROM tweet INNER JOIN like ON tweet.tweet_id=like.tweet_id
        INNER JOIN reply ON tweet.tweet_id=reply.tweet_id
        WHERE tweet.tweet_id='${tweetId}';`;
      const getResponse = await database.get(getQuery);
      response.status(200);
      response.send(getResponse);
    }
  }
);

app.get(
  "/tweets/:tweetId/likes/",
  tokenValidating,
  getUserId,
  async (request, response) => {
    const { tweetId } = request.params;

    const { user_id } = request;
    const getUser = `SELECT user_id FROM tweet WHERE tweet_id='${tweetId}';`;
    const dbUser = await database.get(getUser);
    console.log(dbUser.user_id, user_id);
    if (dbUser.user_id !== user_id) {
      response.status(400);
      response.send("Invalid Request");
    } else {
      const getQuery = `SELECT username  FROM user INNER JOIN like
      ON user.user_id=like.user_id Where like.tweet_id='${tweetId}';`;
      const getResponse = await database.all(getQuery);
      const result = getResponse.map((each) => {
        return each.username;
      });
      const likes = {
        likes: result,
      };
      response.status(200);
      response.send(likes);
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  tokenValidating,
  getUserId,
  async (request, response) => {
    const { tweetId } = request.params;

    const { user_id } = request;
    const getUser = `SELECT user_id FROM tweet WHERE tweet_id='${tweetId}';`;
    const dbUser = await database.get(getUser);
    console.log(dbUser.user_id, user_id);
    if (dbUser.user_id !== user_id) {
      response.status(400);
      response.send("Invalid Request");
    } else {
      const getQuery = `SELECT username  FROM user INNER JOIN reply
      ON user.user_id=reply.user_id Where reply.tweet_id='${tweetId}';`;
      const getResponse = await database.all(getQuery);
      const result = getResponse.map((each) => {
        return each.username;
      });
      const reply = {
        replies: result,
      };
      response.status(200);
      response.send(reply);
    }
  }
);

app.get(
  "/user/tweets/",
  tokenValidating,
  getUserId,
  async (request, response) => {
    const { user_id } = request;
    // const getUser = `SELECT following_user_id FROM follower WHERE follower_user_id='${user_id}';`;
    // const followUser = await database.all(getUser);
    // const followUserId = followUser.map((each) => {
    //   return each.following_user_id;
    // });

    console.log(user_id);
    const getQuery = `SELECT tweet.tweet,count(like.tweet_id) as likes,count(reply.tweet_id) as replies,tweet.date_time as dateTime
    FROM tweet  JOIN like ON tweet.tweet_id=like.tweet_id
     JOIN reply ON tweet.tweet_id=reply.tweet_id
     WHERE tweet.user_id=${user_id}
    GROUP BY tweet.tweet_id
    ORDER BY tweet.tweet_id;`;
    const getResponse = await database.all(getQuery);
    console.log(getResponse);
    response.status(200);
    response.send(getResponse);
  }
);

app.post(
  "/user/tweets/",
  tokenValidating,
  getUserId,
  async (request, response) => {
    const { tweet } = request.body;
    console.log(tweet);
    const { user_id } = request;
    const tweeter = `SELECT tweet_id FROM tweet
    INNER JOIN user ON tweet.user_id=user.user_id
    WHERE user.user_id='${user_id}';`;
    const tweetUser = await database.get(tweeter);
    console.log(tweetUser);
    const tweetId = tweetUser.tweet_id + 1;
    console.log(tweetId);
    const myDate = new Date();
    console.log(myDate);
    const postQuery = `INSERT INTO tweet(tweet,user_id,date_time)
    values ('${tweet}','${user_id}','${myDate}');`;
    const postResponse = await database.run(postQuery);
    console.log(postResponse);
    response.status(200);
    response.send("Created a Tweet");
  }
);

app.delete(
  "/tweets/:tweetId/",
  tokenValidating,
  getUserId,
  async (request, response) => {
    const { tweetId } = request.params;
    const { user_id } = request;
    const getUser = `SELECT user_id FROM tweet WHERE tweet_id='${tweetId}';`;
    const dbUser = await database.get(getUser);
    console.log(dbUser.user_id, user_id);
    if (dbUser.user_id !== user_id) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const { tweetId } = request.params;
      const deleteQuery = `DELETE FROM tweet WHERE tweet_id='${tweetId}';`;
      const deleteResponse = await database.run(deleteQuery);
      response.status(200);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
