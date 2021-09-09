const { MongoClient } = require('mongodb')
      Site = require('./Site'),
      puppeteer = require('puppeteer'),
      sharp = require('sharp'),
      sanitize = require('sanitize-filename'),
      escape = require('escape-html'),
      FormData = require('form-data')
      axios = require('axios'),
      delay = require('delay')

;(async () => {
   const client = await MongoClient.connect('mongodb://localhost:27017', { useUnifiedTopology: true }),
         db = client.db('dcinside_subscriber'),
         envCollection = db.collection('env'),
         postsCollection = db.collection('posts'),
         env = {
            recentPostsLimit: 30,
            savedPostsLimit: 30,
            unallowedRegex: '백업금지',
            minRecommendRatio: 0.2,
            ...await envCollection.findOne({}, { sort: { $natural: -1 } })
         }

   if (!env.board) {
      throw new Error('can not find env')
   }

   const site = Site({ board: env.board })

   async function work() {
      try {
         const savedPosts = await postsCollection.find({}, { limit: env.savedPostsLimit, sort: { no: -1 } }).toArray()
         if (savedPosts.length === 0) {
            const posts = await site.getPosts({ limit: 1 })
            if (posts.length > 0) {
               await postsCollection.insertOne(posts[0])
            }
            throw new Error('empty savedPosts')
         }

         const postsRecent = await site.getPosts({ offsetNo: savedPosts[savedPosts.length - 1].no }),
               posts = postsRecent.filter(({ no }) =>
                  !savedPosts.find(({ no: no_ }) => no === no_)
               )
         for (let post of posts.reverse()) {
            const browser = await puppeteer.launch()
            try {
               const page = await browser.newPage()
               await page.setDefaultNavigationTimeout(60 * 1000)
               await page.setUserAgent('Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.81 Mobile Safari/537.36')
               await page.setViewport({ width: 600, height: 2048 })
               await page.goto(post.link, { waitUntil: 'networkidle2' })
               await page.evaluate(() => $('#div_adnmore_area').hide())

               const [text, recommendRatio] = await page.evaluate(() => [$('.thum-txtin').html(), parseInt($('#recomm_btn_member').html()) / parseInt($('#recomm_btn').html())])
               if (text.match(env.unallowedRegex)) {
                  throw new Error('unallowed')
               }
               else if (recommendRatio <= env.minRecommendRatio) {
                  throw new Error('low recommendRatio')
               }

               await page.emulateMediaType('screen')

               const pdf = await page.pdf({ width: 1024, height: 2048 }),
                     image = await page.screenshot({ type: 'jpeg', clip: { x: 0, y: 180, width: 600, height: 600 } }),
                     thumbnail = await sharp(image).resize({ width: 240 }).toBuffer()

               const formData = new FormData(),
                     filename = sanitize(post.title) || '_'
               formData.append('chat_id', env.chatId)
               formData.append('document', pdf, { filename: `${filename}.pdf` })
               formData.append('thumb', thumbnail, { filename: `${filename}.jpg` })
               formData.append('caption', `${escape(post.title)} - ${escape(post.writer)}\n<a href="${post.link}">본문 보기</a>`)
               formData.append('parse_mode', 'HTML')
               await axios.post(`https://api.telegram.org/bot${env.botToken}/sendDocument`, formData, {
                  headers: formData.getHeaders(),
                  maxContentLength: Infinity,
                  maxBodyLength: Infinity
               })

               await postsCollection.insertOne(post)
               console.log(post)
            }
            catch (err) {
               console.error(err)

               const result = {
                  ...post,
                  err: err.toString()
               }

               await postsCollection.insertOne(result)
               console.log(result)
            }
            finally {
               await browser?.close()
            }

            await delay(1000)
         }
      }
      catch (err) {
         console.error(err)
      }
   }

   while (true) {
      await work()
      await delay(env.interval)
   }
})()