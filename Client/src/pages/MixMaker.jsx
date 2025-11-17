import React from 'react'
import { useState } from 'react'
import { useUser } from "@clerk/clerk-react";

const BACKEND_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const MixMaker = () => {
  const [driveLink, setdriveLink] = useState("");
  const { user, isSignedIn } = useUser();

  const handleChange = (e) =>{
    setdriveLink(e.target.value);
  }

  const handleClick = async () =>{

    try{
      if (!isSignedIn) {
        alert("Please sign in first.");
        return;
      }
      const trimmed = (driveLink || "").trim();
      if (!trimmed) {
        alert("Paste a Google Drive folder link first.");
        return;
      }
      
      const res = await fetch(`${BACKEND_URL}/data`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: driveLink,
          userId: user.id
        })
      })  
  
      let data = await res.json()
      console.log(data)
    }
    catch(e){
      console.log(e)
    }
  }

  return (
    <div className='flex justify-center pt-15 gap-5'>
    <div>MixMaker</div>
    <input value={driveLink} onChange={handleChange} className='bg-red-200' type="text" />
    <button onClick={handleClick} className='cursor-pointer bg-amber-400 px-3 py-1 hover:bg-amber-600 transition-all duration-300  rounded-3xl'>Submit</button>
  </div>
  )
}

export default MixMaker