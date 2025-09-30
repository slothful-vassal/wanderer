import express from "express"
import * as dotevnv from "dotenv"
import { locationsRouter } from "./locations/locations.routes"

dotevnv.config()

if (!process.env.PORT) {
    console.log(`No port value specified...`)
}

const PORT = parseInt(process.env.PORT as string, 10)

const app = express()

const cors = require('cors');

app.use(express.json())
app.use(express.urlencoded({extended : true}))
app.use(cors());

const options = {

    origin: 'http://localhost:5173',

};

app.use(cors(options));

app.use('/', locationsRouter)

app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`)
})