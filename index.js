//@ts-check
import { firefox } from "playwright"

import { rateLimit } from "express-rate-limit"
import express from "express"
import z from "zod"

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes).
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ipv6Subnet: 56,
})

const app = express()
const port = 3008

let isReady = false

app.use((req, res, next) => {
    if (!isReady) res.json({
        error: 500,
        message: "API not ready yet. Please try again in a moment."
    })
    next()
})
app.use(limiter)

app.listen(port, () => {
    console.log(`API listening on port ${port}`)
})

const locationsModel = z.array(z.tuple([z.number(), z.number(), z.string()], {error: "Locations should be: [number, string, string]"})).min(1)

async function start() {
    console.time("Starting API")
    const browser = await firefox.launch()
    const context = await browser.newContext()
    const page = await context.newPage()

    console.timeLog("Starting API", "Waiting for response")
    const response = page.waitForResponse('**/api/search**&limit=24**')

    console.timeLog("Starting API", "Heading to asunnot.oikotie.fi")
    await page.goto("https://asunnot.oikotie.fi/myytavat-asunnot?cardType=100&locations=%5B%5B39,6,%22Espoo%22%5D%5D")

    console.timeLog("Starting API", "Collecting headers")
    const headers = await (await response).request().allHeaders()

    console.timeLog("Starting API", "Closing browser")
    await browser.close()

    console.timeLog("Starting API", "API ready")
    isReady = true

    app.get("/randomProperty", async (req, res) => {
        let areas
        try {
            areas = JSON.parse(req.query.locations?.toString() || "")
        } catch {
            res.json({
                error: 400,
                message: "Invalid or missing query parameter: locations"
            })
        }
        const { success, data, error } = locationsModel.safeParse(areas)
        if (!success || error) return res.json({
            error: 400,
            message: `Invalid query parameter "locations": ${z.treeifyError(error).errors.join(", ")}`
        })
        const propertyCount = (await getProperties(headers, data)).found
        const propertyIndex = Math.floor(Math.random() * propertyCount)
        res.json(await getProperties(headers, data, 1, propertyIndex))
    })

    console.timeEnd("Starting API")
}
/**
 * @param {HeadersInit}             headers
 * @param {PropertyQueryLocation[]} locations
 * @param {number}                  limit
 * @param {number}                  offset
 * @param {PropertyQueryOrderBy}    sortBy
 */
async function getProperties(headers, locations, limit = 0, offset = 0, sortBy = "popularity_week_desc") {
    return await fetchJson(`https://asunnot.oikotie.fi/api/search?locations=${JSON.stringify(locations)}&cardType=100&limit=${limit}&offset=${offset}&sortBy=${sortBy}`, headers)
}
/**
 * 
 * @param   {string}      url
 * @param   {HeadersInit} [headers]
 * @param   {RequestInit} [options]
 * @returns {Promise<OikotiePropertyCardsResponse>}
 */
async function fetchJson(url, headers = {}, options) {
    return await (await fetch(url, { ...options, ...{ headers } })).json()
}
start()
/**
 * @typedef {"published_sort_desc" | "published_sort_asc" | "price_desc" | "price_asc" | "size_desc" | "size_asc" | "viewings" | "popularity_week_desc"} PropertyQueryOrderBy
 * @typedef {[number, number, string]} PropertyQueryLocation
 * @typedef {{found: number, start: number}} OikotieMultipleResponse
 * @typedef {{cards: OikotiePropertyCard[]} & OikotieMultipleResponse} OikotiePropertyCardsResponse
 * @typedef {{
 * cardId: number,
 * cardType: number,
 * cardSubType: number,
 * url: string,
 * status: number,
 * recommendationId: number?,
 * data: OikotiePropertyCardData,
 * location: OikotiePropertyLocation,
 * meta: OikotiePropertyMetaData,
 * medias: OikotiePropertyMedia[]
 * }} OikotiePropertyCard
 * @typedef {{
 * description: string,
 * rooms: number,
 * roomConfiguration: string,
 * price: string,
 * size: string,
 * buildYear: string,
 * sizeMin: 254,
 * sizeMax: 254,
 * nextViewing: null,
 * newDevelopment: boolean,
 * isOnlineOffer: boolean,
 * extraVisibility: boolean,
 * visits: number,
 * visitsWeekly: number,
 * securityDeposit: null,
 * maintenanceFee: null,
 * floor: number,
 * buildingFloorCount: number,
 * pricePerSqm: number,
 * condition: null,
 * sourceType: number,
 * }} OikotiePropertyCardData
 * @typedef {{
 * address: string
 * district: string
 * city: string
 * zipCode: string
 * country: string
 * latitude: number
 * longitude: number
 * }} OikotiePropertyLocation
 * @typedef {{
 * published: string,
 * contractType: number,
 * listingType: number,
 * cardViewType: number,
 * sellStatus: number,
 * priceChanged: string,
 * vendorAdId: string,
 * vendorCompanyId: string,
 * senderNode: string,
 * publishedSort: string,
 * }} OikotiePropertyMetaData
 * @typedef {{
 * imageSmallJPEG: string
 * imageLargeJPEG: string
 * imageDesktopWebP: string
 * imageDesktopWebPx2: string
 * imageTabletWebP: string
 * imageTabletWebPx2: string
 * imageMobileWebP: string
 * imageMobileWebPx2: string
 * imageMobileSmallWebP: string
 * imageMobileSmallWebPx2: string
 * }} OikotiePropertyMedia
 */