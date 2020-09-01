# dcinside_subscriber

### Default settings

* Install mongodb
* Use db `dcinside_subscriber`
* Create collection `env` and insert a document
  ##### env example
  ```jsonc
  {
      "board": "cartoon",           // board name
      "interval": 60000,            // refresh interval
      "botToken": "123456:ABCDEFG", // telegram bot token 
      "chatId": "@channelname"      // telegram channel id
  }
  ```
