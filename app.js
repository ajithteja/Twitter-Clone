const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const format = require("date-fns/format");

let app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;
let initializeDbAndServer = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(3000, () => {
      console.log("Server running At http://localhost:3000/");
    });
  } catch (e) {
    console.log(`ERROR: ${e.message}`);
  }
};
initializeDbAndServer();

let authentication = async (request, response, next) => {
  let jwtToken;
  let authorizationTkn = request.headers["authorization"];
  if (authorizationTkn !== undefined) {
    jwtToken = authorizationTkn.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    await jwt.verify(jwtToken, "SECRETE_KEY", (error, payload) => {
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

// API 3   get   /user/tweets/feed/

app.get("/user/tweets/feed/", authentication, async (request, response) => {
  let { username } = request;

  let followQuery = `SELECT follower.following_user_id 
    FROM user INNER JOIN 
    follower ON 
    user.user_id = follower.follower_user_id
    WHERE user.username = '${username}';`;
  let followData = await db.all(followQuery);

  let followArr = [];
  for (let eachVal of followData) {
    followArr.push(eachVal.following_user_id);
  }
  let newTuple = `(${followArr.join(",")})`;
  let sqlTweetQuery = `SELECT username, tweet, date_time AS dateTime FROM user NATURAL JOIN tweet 
    WHERE user_id IN ${newTuple}
    ORDER BY date_time DESC
    LIMIT 4;`;
  let tweetArr = await db.all(sqlTweetQuery);

  response.send(tweetArr);
});

// API 4  get   Path: `/user/following/`

app.get("/user/following/", authentication, async (request, response) => {
  let { username } = request;
  let sqlQueryForFollowing = `SELECT following_user_id FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id WHERE user.username = '${username}';`;
  let followingData = await db.all(sqlQueryForFollowing);
  let newArr = [];
  for (let eachVal of followingData) {
    newArr.push(eachVal.following_user_id);
  }
  let newTuple = `(${newArr.join(",")})`;
  let followingUserNameQuery = `SELECT name FROM user WHERE user_id IN ${newTuple};`;
  let userNameArr = await db.all(followingUserNameQuery);

  response.send(userNameArr);
});

// API 5  get   Path: `/user/followers/`

app.get("/user/followers/", authentication, async (request, response) => {
  let { username } = request;
  let followerIdQuery = `SELECT follower_user_id FROM user INNER JOIN follower ON user.user_id = follower.following_user_id WHERE user.username = '${username}';`;
  let followerIdArr = await db.all(followerIdQuery);
  let newArr = [];
  for (eachVal of followerIdArr) {
    newArr.push(eachVal.follower_user_id);
  }
  let newTuple = `(${newArr.join(",")})`;
  let followerNamesQuery = `SELECT name FROM user WHERE user_id IN ${newTuple};`;
  let followerNamesArr = await db.all(followerNamesQuery);

  response.send(followerNamesArr);
});

// API 6 get   Path: `/tweets/:tweetId/`

app.get("/tweets/:tweetId/", authentication, async (request, response) => {
  let { tweetId } = request.params;
  let { username } = request;

  let followerTweetQuery = `SELECT * FROM follower WHERE 
  follower_user_id = (SELECT user_id FROM user WHERE username = '${username}')
  AND following_user_id IN (SELECT user_id FROM tweet WHERE tweet_id = ${tweetId});`;
  let idFollowing = await db.all(followerTweetQuery);
  if (idFollowing.length === 0) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    let tweetQuery = `SELECT tweet FROM tweet WHERE tweet_id = ${tweetId};`;
    let tweet = await db.get(tweetQuery);

    let likesQuery = `SELECT COUNT() AS likes FROM like WHERE tweet_id = ${tweetId}`;
    let likes = await db.get(likesQuery);

    let replyQuery = `SELECT COUNT() AS replies FROM reply WHERE tweet_id = ${tweetId}`;
    let reply = await db.get(replyQuery);

    let dateQuery = `SELECT date_time AS dateTime FROM tweet WHERE tweet_id = ${tweetId};`;
    let dateTime = await db.get(dateQuery);
    response.send({
      tweet: tweet.tweet,
      likes: likes.likes,
      replies: reply.replies,
      dateTime: dateTime.dateTime,
    });
  }
});

// API 7   GET  Path: /tweets/:tweetId/likes/

app.get(
  "/tweets/:tweetId/likes/",
  authentication,
  async (request, response) => {
    let { tweetId } = request.params;
    let { username } = request;

    let hasUserFollowingQuery = `SELECT * FROM follower 
  WHERE follower.follower_user_id = (SELECT user_id FROM user WHERE username = '${username}')
  AND follower.following_user_id = (SELECT user_id FROM tweet WHERE tweet_id = ${tweetId});`;
    let dbObj = await db.get(hasUserFollowingQuery);
    if (!dbObj) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      console.log("USER EXIST");
      let likeQuery = `SELECT username FROM user NATURAL JOIN like WHERE tweet_id = ${tweetId};`;
      let likes = await db.all(likeQuery);

      let likesArr = likes.map((eachObj) => eachObj.username);
      response.send({
        likes: likesArr,
      });
    }
  }
);

// API 8   Path: /tweets/:tweetId/replies/

app.get(
  "/tweets/:tweetId/replies/",
  authentication,
  async (request, response) => {
    let { tweetId } = request.params;
    let { username } = request;
    let hasUserFollowingQuery = `SELECT * FROM follower 
  WHERE follower.follower_user_id = (SELECT user_id FROM user WHERE username = '${username}')
  AND follower.following_user_id = (SELECT user_id FROM tweet WHERE tweet_id = ${tweetId});`;
    let dbObj = await db.get(hasUserFollowingQuery);
    if (!dbObj) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      let replyQuery = `SELECT name, reply FROM user NATURAL JOIN reply WHERE tweet_id = ${tweetId};`;
      let dbReply = await db.all(replyQuery);
      response.send({
        replies: dbReply,
      });
    }
  }
);

// API 9   GET   Path: /user/tweets/

app.get("/user/tweets/", authentication, async (request, response) => {
  let { username } = request;
  let tweetQuery = `SELECT tweet, tweet_id, date_time FROM 
  user NATURAL JOIN 
  tweet WHERE user.username = '${username}';`;
  let tweetsArr = await db.all(tweetQuery);
  let tweetIds = tweetsArr.map((eachOj) => eachOj.tweet_id);

  let newTuple = `(${tweetIds.join(",")})`;

  let likesQuery = `SELECT COUNT() AS countLike, tweet_id FROM like WHERE tweet_id IN ${newTuple} GROUP BY tweet_id;`;
  let likes = await db.all(likesQuery);
  let replyQuery = `SELECT COUNT() AS countReply, tweet_id FROM reply WHERE tweet_id IN ${newTuple} GROUP BY tweet_id;`;
  let replyArr = await db.all(replyQuery);

  let newTweet = [];
  for (let eachId of tweetIds) {
    let newObj = {};
    let newTweetArr = tweetsArr.filter(
      (eachObj) => eachObj.tweet_id === eachId
    );
    newObj.tweet = newTweetArr[0].tweet;
    let newLikes = likes.filter((eachLike) => eachId === eachLike.tweet_id);

    if (newLikes.length > 0) {
      newObj.likes = newLikes[0].countLike;
    }

    let newReply = replyArr.filter(
      (eachReply) => eachId === eachReply.tweet_id
    );

    if (newReply.length > 0) {
      newObj.replies = newReply[0].countReply;
    }
    newObj.dateTime = newTweetArr[0].date_time;
    newTweet.push(newObj);
  }

  response.send(newTweet);
});

// API 10  POST   Path: /user/tweets/

app.post("/user/tweets/", authentication, async (request, response) => {
  let { username } = request;
  let userIDQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  let userId = await db.get(userIDQuery);
  let date = new Date();
  let newDataFormate = format(date, "yyyy-MM-dd hh:mm:ss");

  let userTweet = request.body;
  let tweetPostQuery = `INSERT INTO tweet (tweet, user_id, date_time)
        VALUES ('${userTweet.tweet}',${userId.user_id}, '${newDataFormate}' );`;
  await db.run(tweetPostQuery);
  response.send("Created a Tweet");
});

// API 11   DELETE   Path: /tweets/:tweetId/

app.delete("/tweets/:tweetId/", authentication, async (request, response) => {
  let { username } = request;
  let { tweetId } = request.params;
  let isUsersTweet = `SELECT * FROM user NATURAL JOIN tweet 
    WHERE tweet_id = "${tweetId}" 
    AND user_id = (SELECT user_id FROM user WHERE username = '${username}');`;
  let usersTweet = await db.get(isUsersTweet);
  if (!usersTweet) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    let tweetDeleteQuery = `DELETE FROM tweet WHERE tweet_id = ${tweetId};`;
    await db.run(tweetDeleteQuery);

    response.send("Tweet Removed");
  }
});

// API 1 POST  Path: /register/

app.post("/register/", async (request, response) => {
  let { username, password, name, gender } = request.body;
  let bcryptKey = await bcrypt.hash(password, 10);
  let sqlRegisterQuery = `SELECT * FROM user WHERE username = '${username}';`;

  let isUserExist = await db.get(sqlRegisterQuery);
  if (isUserExist !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      let sqlRegisterQuery = `INSERT INTO user (name, username, password, gender)
        VALUES ('${name}', '${username}', '${bcryptKey}', '${gender}');`;
      await db.run(sqlRegisterQuery);
      response.send("User created successfully");
    }
  }
});

// API 2 post   Path: /login/

app.post("/login/", async (request, response) => {
  let { username, password } = request.body;
  let isUserExistQuery = `SELECT * FROM user WHERE username = '${username}';`;
  let userExistData = await db.get(isUserExistQuery);
  if (userExistData === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    let hasPasswordCorrect = await bcrypt.compare(
      password,
      userExistData.password
    );
    if (hasPasswordCorrect) {
      let payload = {
        username: username,
      };
      let jwtToken = await jwt.sign(payload, "SECRETE_KEY");
      response.send({ jwtToken: jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

module.exports = app;
