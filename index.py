from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
from bs4 import BeautifulSoup

# Initialize FastAPI app
app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust origins as needed
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request model
class ScrapeRequest(BaseModel):
    url: str

@app.post("/scrape")
async def scrape_product_data(request: ScrapeRequest):
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(request.url)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, 'html.parser')

            title = soup.title.text if soup.title else 'No title available'
            description = soup.find('meta', attrs={'name': 'description'})
            description = description.get('content', '') if description else ''

            if not description or len(description) < 10:
                first_p = soup.find('p')
                first_h1 = soup.find('h1')
                first_h2 = soup.find('h2')
                description = (first_p.text if first_p else 
                             first_h1.text if first_h1 else 
                             first_h2.text if first_h2 else 
                             'No relevant content found')

            brand_name = (
                soup.find('meta', property='og:site_name').get('content', '')
                if soup.find('meta', property='og:site_name')
                else request.url.split('//')[1].split('/')[0]
            ) or 'Unknown Brand'

            product_name = (
                soup.find('h1').text if soup.find('h1')
                else title
            ) or 'Unknown Product'

            return {
                'brandName': brand_name,
                'productName': product_name,
                'productDescription': description or 'No description available'
            }

    except Exception as error:
        print(f'Error scraping product data: {str(error)}')
        raise HTTPException(status_code=500, detail='Failed to scrape the product data')

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)