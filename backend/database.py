from sqlalchemy import create_engine, Column, Integer, String, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

# SQLite database URL
# If /data directory exists (Railway Volume), use it for persistence.
# Otherwise use local file (ephemeral in cloud, persistent locally).
if os.path.exists("/data"):
    SQLALCHEMY_DATABASE_URL = "sqlite:////data/layout_settings.db"
    print("Using persistent volume database: /data/layout_settings.db")
else:
    SQLALCHEMY_DATABASE_URL = "sqlite:///./layout_settings.db"
    print("Using local database: ./layout_settings.db")

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class LayoutSetting(Base):
    __tablename__ = "layout_settings"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    
    # Keyword to identify this layout in the PDF text
    keyword = Column(String)
    
    # Coordinates for validation (x0, y0, x1, y1) - Used to check if keyword exists here
    keyword_x0 = Column(Float, default=0.0)
    keyword_y0 = Column(Float, default=0.0)
    keyword_x1 = Column(Float, default=0.0)
    keyword_y1 = Column(Float, default=0.0)

    # Coordinates for extraction (x0, y0, x1, y1) - Area to extract the address/name from
    extract_x0 = Column(Float, default=0.0)
    extract_y0 = Column(Float, default=0.0)
    extract_x1 = Column(Float, default=0.0)
    extract_y1 = Column(Float, default=0.0)

def init_db():
    Base.metadata.create_all(bind=engine)
