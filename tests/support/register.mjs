// node --test için: paylaşılan paketteki uzantısız TypeScript importlarını çözen kancayı kaydeder.
import { register } from 'node:module'

register('./ts-resolve.mjs', import.meta.url)
