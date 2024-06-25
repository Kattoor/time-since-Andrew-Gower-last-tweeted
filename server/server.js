const http = require('http');
const readline = require('readline');

const puppeteer = require('puppeteer');

async function getTweetData() {
    const browser = await puppeteer.launch({headless: true, args: ['--no-sandbox']});
    const page = await browser.newPage();

    const username = '';
    const password = '';

    async function logIn() {
        await page.goto('https://x.com/i/flow/login', {waitUntil: 'networkidle0'});

        await page.waitForSelector('input[type="text"]', {visible: true});
        await page.type('input[name="text"]', username);

        await page.evaluate(() => {
            const buttons = document.querySelectorAll('button:has(div>span>span)');
            for (let button of buttons) {
                const span = button.querySelector('div > span > span');
                if (span.innerText === 'Next') {
                    button.click();
                    return;
                }
            }
        });

        const inputElement = await page.waitForSelector('input', {visible: true});
        const inputName = await (await inputElement.getProperty('name')).jsonValue();

        if (inputName === 'text') {
            await page.type('input[name="text"]', '');
            await page.click('button[data-testid="ocfEnterTextNextButton"]');
        }

        await fillInPassword();
    }

    async function fillInPassword() {
        await page.waitForSelector('input[type="password"]', {visible: true});
        await page.type('input[name="password"]', password);
        await Promise.all([
            //page.waitForNavigation(),
            page.click('button[data-testid="LoginForm_Login_Button"]')
        ]);

        const confirmationCodeRequiredSelector = 'a[href="https://help.twitter.com/managing-your-account/additional-information-request-at-login"]';
        await Promise.race([
            page.waitForSelector(confirmationCodeRequiredSelector),
            page.waitForNavigation()
        ]);

        if (await page.$(confirmationCodeRequiredSelector)) {
            const confirmationCode = await getConfirmationCode();
            /*const confirmationCode = 'n7y4hgwr';*//*await new Promise((resolve) => {
                const rl = readline.createInterface(process.stdin, process.stdout);
                rl.setPrompt('Confirmation code > ');
                rl.on('line', (line) => {
                    rl.close();
                    resolve(line);
                });
            });*/
            await page.type('input[name="text"]', confirmationCode);
            await Promise.all([
                page.waitForNavigation(),
                page.click('button[data-testid="ocfEnterTextNextButton"]')
            ]);
        }
    }

    async function getConfirmationCode() {
        const newPage = await browser.newPage();

        const emailUsername = '';
        const emailPassword = '';

        await newPage.goto('https://gmail.com', {waitUntil: 'networkidle0'});

        await newPage.waitForSelector('input[type="email"]', {visible: true});
        await newPage.type('input[type="email"]', emailUsername);
        const buttonSelector = 'div[data-primary-action-label="Next"]>div>div:nth-child(1) button';
        await newPage.click(buttonSelector);

        await newPage.waitForSelector('input[type="password"]', {visible: true});
        await newPage.type('input[type="password"]', emailPassword);
        await newPage.click(buttonSelector);

        const continueButtonSelector = 'div[data-primary-action-label="Continue"]>div>div:nth-child(2) button';
        const firstRowSelector = 'div#\\:\\33>div#\\:\\31>div table tr td#\\:\\31u>div>div>div:nth-child(1) span span';

        await Promise.race([
            newPage.waitForSelector(continueButtonSelector),
            newPage.waitForSelector(firstRowSelector)
        ]);

        if (await newPage.$(continueButtonSelector)) {
            await Promise.all([
                newPage.waitForNavigation(),
                newPage.click(continueButtonSelector)
            ]);
        }

        const firstRow = await newPage.waitForSelector(firstRowSelector);
        const result = await firstRow.evaluate((row) => row.innerText.split(' ').slice(-1)[0]);
        await newPage.close();
        return result;
    }

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

    await logIn();
    const lastTweet = await scrapeTweets();
    const embed = await getEmbed(lastTweet.id);
    await browser.close();

    return {dateTime: lastTweet.dateTime, embed};
}

(async () => {
    let dateTime, embed, lastChecked;

    http.createServer((req, res) => {
        const headers = {
            'Access-Control-Allow-Origin': '*', /* @dev First, read about security */
            'Access-Control-Allow-Methods': 'OPTIONS, GET',
            'Access-Control-Max-Age': 2592000, // 30 days
        };

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
    }, 60000);
})();
