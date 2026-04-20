import { mount } from 'svelte'

import './assets/main.css'
import 'temporal-polyfill/global'

import App from './App.svelte'

const app = mount(App, {
  target: document.getElementById('app')!
})

export default app
