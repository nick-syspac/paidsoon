import { setDefaultResultOrder } from "dns"
import { config } from "dotenv"

setDefaultResultOrder("ipv4first")
config({ path: ".env.local", quiet: true })
config({ path: ".env", quiet: true })