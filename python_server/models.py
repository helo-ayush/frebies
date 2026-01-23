from pydantic import BaseModel
from typing import Optional

class DriveUrlRequest(BaseModel):
    url: str

class SaveFolderRequest(BaseModel):
    url: str
    userId: str
    folderName: Optional[str] = None

class RemoveFolderRequest(BaseModel):
    userId: str
    folderId: str # This corresponds to the MongoDB _id of the folder document

class GetFoldersRequest(BaseModel):
    userId: str
