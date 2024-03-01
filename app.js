const express = require('express')
const path = require('path')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const app = express()
app.use(express.json())

const dbPath = path.join(__dirname, 'twitterClone.db')

let db = null

const initalizeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Started')
    })
  } catch (e) {
    console.log(`Error DB: ${e.message}`)
    process.exit(1)
  }
}

initalizeDbAndServer()

app.get('/users/', async (request, response) => {
  const getUserQuery = `
  SELECT 
    *
  FROM 
    user;`
  const getUsers = await db.all(getUserQuery)
  response.send(getUsers)
})
app.get('/tweet/', async (request, response) => {
  const getUserQuery = `
  SELECT 
    *
  FROM 
    tweet;`
  const getUsers = await db.all(getUserQuery)
  response.send(getUsers)
})

// Authenticate the user

const authentication = (request, response, next) => {
  let jwtToken
  const userHeader = request.headers['authorization']

  if (userHeader !== undefined) {
    jwtToken = userHeader.split(' ')[1]
  } else {
    response.status(401)
    response.send('Invalid JWT Token')
  }

  if (jwtToken) {
    jwt.verify(jwtToken, 'SECRET_KEY', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.userName = payload.username
        request.userId = payload.userId
        next()
      }
    })
  }
}

// GET USER folling people Id

const getUserFollingIds = async userName => {
  const getUserFollingQuery = `
  SELECT 
    following_user_id  
  FROM 
    follower INNER JOIN user ON user.user_id = follower.follower_user_id
  WHERE 
    user.username = '${userName}';`
  const userFollowingIds = await db.all(getUserFollingQuery)
  return userFollowingIds.map(eachUserId => eachUserId.following_user_id)
}

// API 1

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const isUserInDbQuery = `SELECT * FROM user WHERE username = '${username}';`
  const isUserInDb = await db.get(isUserInDbQuery)

  if (isUserInDb === undefined) {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const hashedPwd = await bcrypt.hash(password, 10)
      const addUserQuery = `
      INSERT INTO
        user (name, username, password, gender)
      VALUES
        ( '${name}', '${username}', '${hashedPwd}', '${gender}');`
      await db.run(addUserQuery)
      response.send('User created successfully')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})

// API 2

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const isUserInDbQuery = `SELECT * FROM user WHERE username = '${username}';`
  const isUserInDb = await db.get(isUserInDbQuery)

  if (isUserInDb === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPwdMatch = await bcrypt.compare(password, isUserInDb.password)
    if (isPwdMatch) {
      const payload = {username: username, userId: isUserInDb.user_id}
      const jwtToken = jwt.sign(payload, 'SECRET_KEY')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

// API 3

app.get('/user/tweets/feed/', authentication, async (request, response) => {
  const {userName, userId} = request
  const userFollowingIds = await getUserFollingIds(userName)
  const userFollowingFeedQuery = `
  SELECT 
    user.username,
    tweet.tweet,
    tweet.date_time as dateTime
  FROM 
    user INNER JOIN tweet ON user.user_id = tweet.user_id
  WHERE
    user.user_id IN (${userFollowingIds})
  ORDER BY
    date_time DESC
  LIMIT 4;`
  const userFollowingFeed = await db.all(userFollowingFeedQuery)
  response.send(userFollowingFeed)
})

// API 4

app.get('/user/following/', authentication, async (request, response) => {
  const {userName, userId} = request
  const userFollowingIds = await getUserFollingIds(userName)
  const userFollingQuery = `
  SELECT
    name
  FROM
    user
  WHERE
    user_id IN (${userFollowingIds});`
  const userFolling = await db.all(userFollingQuery)
  response.send(userFolling)
})

// API 5
app.get('/user/followers/', authentication, async (request, response) => {
  const {userName, userId} = request
  const userFollowersQuery = `
  SELECT
    user.name
  FROM
    follower INNER JOIN user ON follower.follower_user_id = user.user_id
  WHERE
    follower.following_user_id = ${userId};`
  const userFollowers = await db.all(userFollowersQuery)
  response.send(userFollowers)
})

// API 6

app.get('/tweets/:tweetId/', authentication, async (request, response) => {
  const {tweetId} = request.params
  const {userName, userId} = request
  const userFollowingIds = await getUserFollingIds(userName)
  const getTweetUserQuery = `
  SELECT
    user_id
  FROM
    tweet
  WHERE
    tweet_id = ${tweetId};`
  const getTweetUser = await db.get(getTweetUserQuery)
  if (userFollowingIds.includes(getTweetUser.user_id)) {
    const getTweetDetailsQuery = `
    SELECT
      tweet.tweet as tweet,
      count(DISTINCT like.like_id) AS likes,
      count(DISTINCT reply.reply_id) AS replies,
      tweet.date_time as dateTime
    FROM
      tweet INNER JOIN reply ON  tweet.tweet_id	= reply.tweet_id
      INNER JOIN like ON tweet.tweet_id	= like.tweet_id
    WHERE
      tweet.tweet_id = ${tweetId} `
    const getTweetDetails = await db.get(getTweetDetailsQuery)
    response.send(getTweetDetails)
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})

// API 7

app.get(
  '/tweets/:tweetId/likes/',
  authentication,
  async (request, response) => {
    const {tweetId} = request.params
    const {userName, userId} = request
    const userFollowingIds = await getUserFollingIds(userName)
    const getTweetUserQuery = `
  SELECT
    user_id
  FROM
    tweet
  WHERE
    tweet_id = ${tweetId};`
    const getTweetUser = await db.get(getTweetUserQuery)
    if (userFollowingIds.includes(getTweetUser.user_id)) {
      const tweetLikedPeopleQuery = `
    SELECT
      user.username
    FROM
      like INNER JOIN user ON like.user_id = user.user_id
    WHERE
      like.tweet_id = ${tweetId}`
      const tweetLikedPeople = await db.all(tweetLikedPeopleQuery)

      response.send({
        likes: tweetLikedPeople.map(each_username => each_username.username),
      })
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

// API 8

app.get(
  '/tweets/:tweetId/replies/',
  authentication,
  async (request, response) => {
    const {tweetId} = request.params
    const {userName, userId} = request
    const userFollowingIds = await getUserFollingIds(userName)
    const getTweetUserQuery = `
  SELECT
    user_id
  FROM
    tweet
  WHERE
    tweet_id = ${tweetId};`
    const getTweetUser = await db.get(getTweetUserQuery)

    if (userFollowingIds.includes(getTweetUser.user_id)) {
      const tweetRepliesQuery = `
      SELECT
        user.name as name,
        reply.reply
      FROM
        tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
        INNER JOIN user ON user.user_id = reply.user_id
      WHERE
        tweet.tweet_id = ${tweetId}`
      const tweetReplies = await db.all(tweetRepliesQuery)
      response.send({replies: tweetReplies})
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

// API 9

app.get('/user/tweets/', authentication, async (request, response) => {
  const {userName, userId} = request
  const userTweetsQuery = `
   SELECT
    tweet.tweet,
    count(DISTINCT like.like_id) AS likes,
    count(DISTINCT reply.reply_id) AS replies,
    tweet.date_time AS dateTime
  FROM
    tweet LEFT JOIN like ON tweet.tweet_id = like.tweet_id
    LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
  WHERE
    tweet.user_id = ${userId}
  GROUP BY
    tweet.tweet_id`
  const userTweets = await db.all(userTweetsQuery)
  response.send(userTweets)
})

// API 10
app.post('/user/tweets/', authentication, async (request, response) => {
  const {userName, userId} = request
  const {tweet} = request.body
  const addTweet = `
   INSERT INTO
    tweet (tweet, user_id)
  VALUES
    ('${tweet}', ${userId})`
  await db.run(addTweet)
  response.send('Created a Tweet')
})

// API 11

app.delete('/tweets/:tweetId/', authentication, async (request, response) => {
  const {userName, userId} = request
  const {tweetId} = request.params
  const userTweetIdsQuery = `
  SELECT
    tweet.tweet_id
  FROM
    tweet
  WHERE
    user_id = ${userId};`

  const userTweetIds = await db.all(userTweetIdsQuery)
  const tweetIdsList = userTweetIds.map(each_id => each_id.tweet_id)

  if (tweetIdsList.includes(parseInt(tweetId))) {
    const deleteTweetQuery = `DELETE FROM 
        tweet
      WHERE
        tweet_id = ${tweetId}`
    await db.run(deleteTweetQuery)
    response.send('Tweet Removed')
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})

module.exports = app
