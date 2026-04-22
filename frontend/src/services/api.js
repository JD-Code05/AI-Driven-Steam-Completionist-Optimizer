import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle 401 responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// Auth
export const authAPI = {
  getLoginUrl: () => '/api/auth/login',
  me: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
}

// Sync
export const syncAPI = {
  syncGames: () => api.post('/sync/games'),
  syncAchievements: (appId) => api.post(`/sync/achievements/${appId}`),
}

// Games
export const gamesAPI = {
  list: () => api.get('/games'),
  get: (id) => api.get(`/games/${id}`),
}

// Player Games
export const playerGamesAPI = {
  list: (playerId, tracked) => api.get('/player-games', { params: { player_id: playerId, tracked } }),
  update: (id, data) => api.put(`/player-games/${id}`, data),
}

// Achievements
export const achievementsAPI = {
  list: (gameId) => api.get('/achievements', { params: { game_id: gameId } }),
}

// Player Achievements
export const playerAchievementsAPI = {
  list: (playerId, gameId) => api.get('/player-achievements', { params: { player_id: playerId, game_id: gameId } }),
}

// Data Sources
export const dataSourcesAPI = {
  list: (gameId) => api.get('/data-sources', { params: { game_id: gameId } }),
  create: (data) => api.post('/data-sources', data),
  update: (id, data) => api.put(`/data-sources/${id}`, data),
  delete: (id) => api.delete(`/data-sources/${id}`),
  scrape: (id) => api.post(`/data-sources/${id}/scrape`),
  autoDiscover: (gameId) => api.post(`/data-sources/auto-discover/${gameId}`),
}

// AI
export const aiAPI = {
  generate: (gameId) => api.post(`/ai/generate/${gameId}`),
  getRoute: (gameId) => api.get(`/ai/routes/${gameId}`),
  regenerate: (gameId) => api.post(`/ai/regenerate/${gameId}`),
}

// Optimization Routes
export const optimizationAPI = {
  list: (playerId, gameId) => api.get('/optimization-routes', { params: { player_id: playerId, game_id: gameId } }),
  get: (id) => api.get(`/optimization-routes/${id}`),
}

export default api
