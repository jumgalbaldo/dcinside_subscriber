const { JSDOM } = require('jsdom'),
      jquery = require('jquery')

function Site({ board, exception = 'recommend' }) {
   return {
      async getPosts({ offsetNo = 0, limit = 100, page = 1 }) {
         try {
            const { window } = await JSDOM.fromURL(`https://gall.dcinside.com/board/lists?id=${board}&page=${page}&exception_mode=${exception}`),
                  $ = jquery(window),
                  postObjects = $('.ub-content.us-post').toArray().map((element) => $(element)),
                  postsAll = postObjects.map((object) => ({
                     no: object.data('no'),
                     title: object.find('.gall_tit > a:first').text(),
                     link: `https://gall.dcinside.com${object.find('.gall_tit > a:first').attr('href')}`,
                     writer: object.find('.gall_writer > .nickname').text()
                  })),
                  posts = postsAll.filter(({ no }) =>
                     no > offsetNo
                  ),
                  isPostsFiltered = postsAll.length > posts.length,
                  isOverLimit = posts.length >= limit,
                  isLastPage = $('.bottom_paging_box>em').is(':last-child')

            return (posts.length === 0 || isPostsFiltered || isOverLimit || isLastPage) ?
               posts.slice(0, limit) :
               [...posts, ...await this.getPosts({
                  offsetNo,
                  limit: limit - posts.length,
                  page: page + 1
               })]
         }
         catch (err) {
            console.error(err)
            return []
         }
      }
   }
}

module.exports = Site