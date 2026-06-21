import { setDefaultResultOrder } from "dns"
import { config } from "dotenv"

// Force IPv4 DNS resolution before any network connections are made.
setDefaultResultOrder("ipv4first")
config({ path: ".env.local", quiet: true })
