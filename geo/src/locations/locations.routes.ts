import express, { Request, Response } from "express"
import { StatusCodes } from "http-status-codes"
import { searchLocations, searchLocationReverse } from "./locations.data"
import { error } from "console"
import { STATUS_CODES } from "http"

export const locationsRouter = express.Router()

locationsRouter.get("/locations/:name", async (req: Request, res: Response) => {
    try {
        const locs = await searchLocations(req.params.name)

        if (!locs) {
            return res.status(StatusCodes.NOT_FOUND).json({error: 'No location found'})
        }

        return res.status(StatusCodes.OK).json(locs)
    } catch (error) {
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({error})
    }
})

locationsRouter.get("/locations/:reverse", async (req: Request, res: Response) => {
    try {
        const coordinates = await searchLocationReverse(+req.params.lat, +req.params.lon)

        if (!coordinates) {
            return res.status(StatusCodes.NOT_FOUND).json({error: 'No corrdinates fund'})
        }

        return res.status(StatusCodes.OK).json(coordinates)
    } catch (error) {
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({error})
    }
})
