# PCO Query App - Cloudflare Worker

A comprehensive web application for querying Planning Center Online (PCO) people data, built with Cloudflare Workers and TypeScript.

## 🌟 Features

- **Multi-Search Capabilities**: Search by name, email, phone number, grade, and membership
- **CSV Export**: Download search results as CSV files
- **Bulk Updates**: Upload CSV files to update multiple PCO records
- **Rate Limiting**: Built-in API rate limiting to prevent PCO API throttling
- **Type Safety**: Full TypeScript implementation with type guards
- **Global CDN**: Deployed on Cloudflare's global network for fast worldwide access

## 🚀 Live Demo

**Production URL**: https://pco-query-worker.jeremy-caf.workers.dev

## 🛠️ Tech Stack

- **Backend**: Cloudflare Workers (TypeScript)
- **Frontend**: HTML, CSS, JavaScript (Bootstrap 5)
- **API**: Planning Center Online REST API
- **Deployment**: Cloudflare Workers
- **Version Control**: Git

## 📋 Prerequisites

- Node.js 18+ and npm
- Cloudflare account
- Planning Center Online API credentials

## 🔧 Setup & Installation

### 1. Clone the Repository

```bash
git clone <your-repo-url>
cd pco-query-worker
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Set up your PCO API credentials as Cloudflare Worker secrets:

```bash
npx wrangler secret put PCO_APPLICATION_ID
npx wrangler secret put PCO_SECRET
```

### 4. Local Development

```bash
npx wrangler dev --local
```

Visit `http://localhost:8787` to test locally.

### 5. Deploy to Production

```bash
npx wrangler deploy
```

## 📁 Project Structure

```
pco-query-worker/
├── src/
│   └── index.ts          # Main Cloudflare Worker code
├── public/
│   ├── index.html        # Frontend interface
│   └── app.js           # Frontend JavaScript
├── wrangler.jsonc       # Cloudflare Worker configuration
├── package.json         # Dependencies and scripts
├── tsconfig.json        # TypeScript configuration
└── README.md           # This file
```

## 🔌 API Endpoints

### Search Endpoints
- `POST /api/search/name` - Search by first and last name
- `POST /api/search/email` - Search by email address
- `POST /api/search/phone` - Search by phone number
- `POST /api/search/grade` - Search by grade level
- `POST /api/search/membership` - Search by membership type

### Data Endpoints
- `POST /api/person-details` - Get detailed person information
- `POST /api/export` - Export data as CSV
- `GET /api/download-template` - Download bulk update template
- `POST /api/bulk-update` - Process bulk updates

## 🔒 Security Features

- **Rate Limiting**: Prevents API abuse with configurable request limits
- **Type Safety**: Comprehensive TypeScript type guards for all API inputs
- **Error Handling**: Robust error handling with proper HTTP status codes
- **CORS**: Configured for cross-origin requests
- **Secrets Management**: Secure storage of API credentials via Cloudflare secrets

## 🚀 Deployment

This app is automatically deployed to Cloudflare Workers when you run:

```bash
npx wrangler deploy
```

The deployment process:
1. Builds the TypeScript code
2. Uploads static assets (HTML, CSS, JS)
3. Deploys the worker to Cloudflare's global network
4. Provides a `.workers.dev` URL for immediate access

## 🔄 Development Workflow

1. **Make Changes**: Edit code in `src/index.ts` or frontend files
2. **Test Locally**: Run `npx wrangler dev --local`
3. **Commit Changes**: `git add . && git commit -m "Description"`
4. **Deploy**: `npx wrangler deploy`
5. **Push to GitHub**: `git push origin main`

## 📊 Performance

- **Global CDN**: Deployed on Cloudflare's 200+ global locations
- **Edge Computing**: Runs at the edge for minimal latency
- **Rate Limiting**: Prevents API abuse while maintaining performance
- **Optimized Assets**: Compressed static files for fast loading

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support or questions:
- Check the [Cloudflare Workers documentation](https://developers.cloudflare.com/workers/)
- Review the [Planning Center API documentation](https://developer.planning.center/docs/)
- Open an issue in this repository

## 🔄 Version History

- **v1.0.0** - Initial release with search, export, and bulk update functionality
- **v1.1.0** - Added rate limiting and improved error handling
- **v1.2.0** - Enhanced TypeScript type safety and validation

---

**Built with ❤️ for Grace Fellowship Church** 