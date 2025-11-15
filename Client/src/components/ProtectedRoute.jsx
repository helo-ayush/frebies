// ProtectedRoute.jsx
import React, { useEffect, useState } from "react";
import { SignedIn, SignedOut, useClerk, useUser } from "@clerk/clerk-react";
import { useNavigate, useLocation } from "react-router-dom";

export default function ProtectedRoute({ children }) {
  const { openSignIn } = useClerk();
  const { isLoaded, isSignedIn } = useUser();
  const navigate = useNavigate();
  const location = useLocation();

  const [modalOpened, setModalOpened] = useState(false);

  useEffect(() => {
    // Wait until Clerk finishes checking session
    if (!isLoaded) return;

    // If user is signed in, nothing to do
    if (isSignedIn) return;

    // Open modal + navigate only once
    if (!modalOpened) {
      openSignIn({ redirectUrl: location.pathname });
      setModalOpened(true);

      // navigate to home
      navigate("/");
    }
  }, [isLoaded, isSignedIn, modalOpened, openSignIn, navigate, location.pathname]);

  // avoid flicker while Clerk initializes
  if (!isLoaded) return null;

  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>{/* modal opened inside useEffect */}</SignedOut>
    </>
  );
}
