
import envalid, { str } from 'envalid'

export default envalid.cleanEnv(process.env, {
  NFT_STORAGE_API_KEY: str(),
  PUBLISHER_KEYPAIR: str(),
})