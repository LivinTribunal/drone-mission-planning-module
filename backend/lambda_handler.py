from mangum import Mangum

from app.main import app

# AWS Lambda handler - wraps FastAPI with Mangum
handler = Mangum(app, lifespan="off")
