const http = require('http');
const fs = require('fs');

const puppeteer = require('puppeteer');

async function getTweetData() {
    const browser = await puppeteer.launch({headless: true, args: ['--no-sandbox']});
    const page = await browser.newPage();

    async function scrapeTweets() {
        await page.goto('https://x.com/AndrewCGower', {waitUntil: 'networkidle2'});
        await page.waitForFunction(`document.querySelectorAll('article>div>div>div:nth-child(2)>div:nth-child(2)').length > 0`);

        const elements = await page.$$('article>div>div>div:nth-child(2)>div:nth-child(2)');
        const tweets = [];
        for (let div of elements) {
            tweets.push(
                await div.evaluate((el) => ({
                    id: el.querySelector('&>div:nth-child(1)>div>div:nth-child(1)>div>div>div:nth-child(2)>div>div:nth-child(3) a')?.href.split('/').slice(-1)[0],
                    dateTime: el.querySelector('&>div:nth-child(1)>div>div:nth-child(1)>div>div>div:nth-child(2)>div>div:nth-child(3) a time')?.getAttribute('datetime'),
                    text: el.querySelector('&>div:nth-child(2)').innerText,
                    /*image: el.querySelector('&>div:nth-child(3)>div>div>div>div>div>div>a')?.href*/
                }))
            );
        }

        return tweets.sort((tweet1, tweet2) => tweet2.dateTime.localeCompare(tweet1.dateTime))[0];
    }

    async function getEmbed(id) {
        await page.goto(`https://publish.twitter.com/?query=https%3A%2F%2Ftwitter.com%2FAndrewCGower%2Fstatus%2F${id}&widget=Tweet`, {waitUntil: 'networkidle2'});
        const codeElement = await page.waitForSelector('code', {visible: true});
        const codeText = await codeElement.evaluate((element) => element.textContent);
        return codeText;
    }

    //await logIn();
    const cookies = [{name: 'auth_token', value: '', domain: 'x.com'}];
    await page.setCookie(...cookies);
    const lastTweet = await scrapeTweets();
    const embed = await getEmbed(lastTweet.id);
    await browser.close();

    return {dateTime: lastTweet.dateTime, embed};
}

(async () => {
    let dateTime, embed, lastChecked;

    http.createServer((req, res) => {
        const headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'OPTIONS, GET',
            'Access-Control-Max-Age': 2592000
        };

        if (req.url === '/oembed') {
            res.write(JSON.stringify({
                "version": "1.0",
                "type": "rich",
                "title": "Time Since Andrew Gower Last Tweeted",
                "html": "<a href='https://timesinceandrewgowerlasttweeted.com'>View Andrew's last tweet!</a>",
                "author_name": "Andrew Gower",
                "provider_name": "Time Since Andrew Gower Last Tweeted",
                "thumbnail_url": "https://timesinceandrewgowerlasttweeted.com/mawchest.png",
                "thumbnail_width": 600,
                "thumbnail_height": 400
            }));
            res.end();
            return;
        }

        if (req.url === '/index.html') {
            const now = Date.now();
            const q3StartTime = new Date('July 1, 2024 00:00:00 UTC');
            const timeUntilQ3Start = q3StartTime - now;
            const q3StartDays = Math.floor(timeUntilQ3Start / (1000 * 60 * 60 * 24));
            const q3StartHours = Math.floor((timeUntilQ3Start % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const q3StartMinutes = Math.floor((timeUntilQ3Start % (1000 * 60 * 60)) / (1000 * 60));
            const q3StartSeconds = Math.floor((timeUntilQ3Start % (1000 * 60)) / 1000);
            const timeUntilQ3Starts = `${q3StartDays}d ${q3StartHours}h ${q3StartMinutes}m ${q3StartSeconds}s until Q3 starts.`;

            const html = fs.readFileSync('./index.html', 'utf-8');
            const toReplace = "View Andrew's last tweet!";
            res.write(html.replace(toReplace, timeUntilQ3Starts));
            res.end();
            return;
        }

        if (req.method === 'OPTIONS') {
            res.writeHead(204, headers);
            res.end();
        } else {
            res.writeHead(200, headers);
            res.write(JSON.stringify({dateTime, embed, lastChecked}));
            res.end();
        }
    }).listen(3000);

    const tweetData = await getTweetData();
    dateTime = tweetData.dateTime;
    embed = tweetData.embed;
    lastChecked = new Date();

    setInterval(async () => {
        const tweetData = await getTweetData();
        dateTime = tweetData.dateTime;
        embed = tweetData.embed;
        lastChecked = new Date();
    }, 60000 * 5);
})();