const { MongoClient } = require('mongodb')
      Site = require('./Site'),
      puppeteer = require('puppeteer'),
      sharp = require('sharp'),
      sanitize = require('sanitize-filename'),
      FormData = require('form-data')
      axios = require('axios')

;(async () => {
   const client = await MongoClient.connect('mongodb://localhost:27017', { useUnifiedTopology: true }),
         db = client.db('dcinside_subscriber'),
         envCollection = db.collection('env'),
         postsCollection = db.collection('posts'),
         env = await envCollection.findOne({}, { sort: { $natural: -1 } })

   if (!env) {
      throw new Error('can not find env')
   }

   const site = Site({ board: env.board }),
         browser = await puppeteer.launch()

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
            const page = await browser.newPage()
            await page.setUserAgent('Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.81 Mobile Safari/537.36')
            await page.setViewport({ width: 600, height: 2048 })
            await page.goto(post.link, { waitUntil: 'networkidle2' })
            await page.evaluate(() => $('#div_adnmore_area').hide())
            await page.emulateMediaType('screen')

            const pdf = await page.pdf({ width: 1024, height: 2048 }),
                  image = await page.screenshot({ type: 'jpeg', clip: { x: 0, y: 180, width: 600, height: 600 } }),
                  thumbnail = await sharp(image).resize({ width: 240 }).toBuffer()

            await page.close()

            const formData = new FormData()
            formData.append('chat_id', env.chatId)
            formData.append('document', pdf, { filename : sanitize(`${post.title}.pdf`) })
            formData.append('thumb', thumbnail, { filename : sanitize(`${post.title}.jpg`) })
            formData.append('caption', `${post.title} - ${post.writer}\n<a href="${post.link}">본문 보기</a>`)
            formData.append('parse_mode', 'HTML')
            await axios.post(`https://api.telegram.org/bot${env.botToken}/sendDocument`, formData, { headers: formData.getHeaders() })

            await postsCollection.insertOne(post)

            console.log(post)
         }
      }
      catch (err) {
         console.error(err)
      }
      finally {
         setTimeout(work, env.interval)
      }
   }

   work()
})()





