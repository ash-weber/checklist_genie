import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FcGoogle } from "react-icons/fc";
import {
    Button,
    Typography,
    Box,
    Paper,
    TextField,
    CircularProgress,
    Alert,
    Link,
    Divider,
} from "@mui/material";
import { styled } from "@mui/system";
import axios from "axios";

const BackgroundContainer = styled(Box)({
    height: "100vh",
    width: "100vw",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #ffffff, #4682b4)",
    position: "fixed",
    top: 0,
    left: 0,
});

const SignInCard = styled(Paper)({
    padding: "2.5rem",
    borderRadius: "16px",
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.2)",
    textAlign: "center",
    maxWidth: "400px",
    width: "90%",
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    color: "#333",
    zIndex: 2,
    position: "relative",
});

const ActionButton = styled(Button)({
    width: "100%",
    marginTop: "1.2rem",
    padding: "12px",
    borderRadius: "8px",
    textTransform: "none",
    fontSize: "1rem",
    fontWeight: 600,
});

const Home = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const [view, setView] = useState("social");
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        password: "",
        organisationName: "",
        otp: "",
        confirmPassword: "", 
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    const handleSuccessfulLogin = (token) => {
        localStorage.setItem("token", token);
        console.log("Login successful. Navigating...");
        navigate("/User/Browse");
    };

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const token = params.get('token');
        if (token) {
            console.log("Token found in URL, processing social login...");
            window.history.replaceState(null, null, window.location.pathname);
            handleSuccessfulLogin(token);
        }
    }, [location, navigate]);

    const handleInputChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleGoogleSignIn = () => {
        window.location.href = `${process.env.REACT_APP_BACKEND_SERVER_URL}/auth/google`;
    };

    const handleMicrosoftSignIn = () => {
        window.location.href = `${process.env.REACT_APP_BACKEND_SERVER_URL}/microsoft`;
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        try {
            const response = await axios.post(
                `${process.env.REACT_APP_BACKEND_SERVER_URL}/login`,
                { email: formData.email, password: formData.password }
            );
            handleSuccessfulLogin(response.data.token);
        } catch (err) {
            setError(err.response?.data?.message || "Login failed.");
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        setMessage("");
        try {
            await axios.post(`${process.env.REACT_APP_BACKEND_SERVER_URL}/register`, {
                name: formData.name,
                email: formData.email,
                password: formData.password,
                organisationName: formData.organisationName,
            });
            setMessage("OTP sent to your email. Please check your inbox.");
            setView("otp");
        } catch (err) {
            setError(err.response?.data?.error || "Registration failed.");
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOtp = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        setMessage("");
        try {
            await axios.post(`${process.env.REACT_APP_BACKEND_SERVER_URL}/verify`, {
                ...formData,
            });
            setMessage("Registration successful! Please log in.");
            setView("login");
        } catch (err) {
            setError(err.response?.data?.error || "OTP verification failed.");
        } finally {
            setLoading(false);
        }
    };

    const handleRequestPasswordReset = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        setMessage("");
        try {
            await axios.post(
                `${process.env.REACT_APP_BACKEND_SERVER_URL}/request-password-reset`,
                { email: formData.email }
            );
            setMessage("A password reset OTP has been sent to your email.");
            setView("resetPassword");
        } catch (err) {
            setError(err.response?.data?.message || "Failed to send reset OTP.");
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        if (formData.password !== formData.confirmPassword) {
            setError("New passwords do not match.");
            return;
        }
        setLoading(true);
        setError("");
        setMessage("");
        try {
            await axios.post(`${process.env.REACT_APP_BACKEND_SERVER_URL}/reset-password`, {
                email: formData.email,
                otp: formData.otp,
                newPassword: formData.password,
            });
            setMessage("Password has been reset successfully. Please log in.");
            setView("login");
            setFormData(prev => ({ ...prev, password: "", confirmPassword: "", otp: "" }));
        } catch (err) {
            setError(err.response?.data?.message || "Password reset failed.");
        } finally {
            setLoading(false);
        }
    };

    const resetFormState = () => {
        setError("");
        setMessage("");
    };

    const renderForm = (title, fields, onSubmit, submitText, switchViewText, newView) => (
        <>
            <Link
                component="button"
                onClick={() => { setView("social"); resetFormState(); }}
                sx={{ position: "absolute", top: "20px", left: "20px", textDecoration: "none", fontWeight: "bold", ":hover": { background: "white" } }}
            >
                &larr; Back
            </Link>
            <Typography variant="h5" fontWeight="600" color="#25274D" gutterBottom sx={{ mt: 3 }}>
                {title}
            </Typography>
            {(title === "Verify OTP" || title === "Reset Your Password") && (
                <Typography variant="body2" color="textSecondary">
                    An OTP was sent to {formData.email}
                </Typography>
            )}
            <Box component="form" onSubmit={onSubmit} sx={{ mt: 2 }}>
                {fields.map((field) => (
                    <TextField
                        key={field.name}
                        variant="outlined"
                        margin="normal"
                        required
                        fullWidth
                        id={field.name}
                        label={field.label}
                        name={field.name}
                        type={field.type}
                        value={formData[field.name]}
                        onChange={handleInputChange}
                        autoFocus={field.autoFocus}
                    />
                ))}
                <ActionButton
                    type="submit"
                    fullWidth
                    variant="contained"
                    disabled={loading}
                    sx={{ mt: 2, mb: 2, backgroundColor: "#25274D", "&:hover": { backgroundColor: "#1e2240" } }}
                >
                    {loading ? <CircularProgress size={24} color="inherit" /> : submitText}
                </ActionButton>
                <Typography variant="body2">
                    {switchViewText}{" "}
                    <Link component="button" variant="body2" onClick={() => { setView(newView); resetFormState(); }} sx={{ textDecoration: "none", "&:hover": { textDecoration: "underline", background: "white" } }}>
                        Click here
                    </Link>
                </Typography>
            </Box>
        </>
    );

    return (
        <BackgroundContainer>
            <SignInCard elevation={3}>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}

                {view === "social" && (
                    <>
                        <Typography variant="h4" fontWeight="700" color="#25274D" gutterBottom>
                            CHECKLIST GENIE
                        </Typography>
                        <Typography variant="body1" color="textSecondary" gutterBottom>
                            Streamline your workflow and boost productivity.
                        </Typography>
                        <ActionButton
                            variant="outlined"
                            startIcon={<FcGoogle size={24} />}
                            onClick={handleGoogleSignIn}
                            sx={{ color: '#333', borderColor: '#ccc', '&:hover': { backgroundColor: '#f5f5f5' } }}
                        >
                            Sign In With Google
                        </ActionButton>
                        <ActionButton
                            variant="contained"
                            startIcon={
                                <img
                                    src="https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg"
                                    alt="Microsoft Logo"
                                    style={{ width: 20, height: 20 }}
                                />
                            }
                            onClick={handleMicrosoftSignIn}
                            sx={{ backgroundColor: '#fff', color: '#333', border: '1px solid #ccc', '&:hover': { backgroundColor: '#f5f5f5' } }}
                        >
                            Sign In With Microsoft
                        </ActionButton>
                        <Divider sx={{ my: 2 }}>OR</Divider>
                        <ActionButton
                            variant="contained"
                            onClick={() => setView("login")}
                            sx={{ backgroundColor: '#25274D', '&:hover': { backgroundColor: '#1e2240' } }}
                        >
                            Continue with Email
                        </ActionButton>
                    </>
                )}

                {view === "login" && (
                    <>
                        {renderForm(
                            "Login",
                            [
                                { name: "email", label: "Email Address", type: "email", autoFocus: true },
                                { name: "password", label: "Password", type: "password" },
                            ],
                            handleLogin,
                            "Login",
                            "Don't have an account?",
                            "register"
                        )}
                        <Box textAlign="right" sx={{ mt: 2 }}>
                             <Link component="button" variant="body2" onClick={() => { setView('forgotPassword'); resetFormState(); }} sx={{ textDecoration: "none", "&:hover": { textDecoration: "underline", background: "white" } }}>
                                Forgot Password?
                            </Link>
                        </Box>
                    </>
                )}
                
                {view === "register" && renderForm("Create Account", [{ name: "name", label: "Full Name", type: "text", autoFocus: true }, { name: "email", label: "Email Address", type: "email" }, { name: "password", label: "Password", type: "password" }, { name: "organisationName", label: "Organisation Name", type: "text" },], handleRegister, "Register & Get OTP", "Already have an account?", "login")}
                
                {view === "otp" && renderForm("Verify OTP", [{ name: "otp", label: "6-Digit OTP", type: "text", autoFocus: true },], handleVerifyOtp, "Verify & Complete", "Didn't get an OTP?", "register")}

                {view === "forgotPassword" && renderForm(
                    "Forgot Password",
                    [{ name: "email", label: "Enter your registered email", type: "email", autoFocus: true }],
                    handleRequestPasswordReset,
                    "Send Reset OTP",
                    "Remember your password?",
                    "login"
                )}

                {view === "resetPassword" && renderForm(
                    "Reset Your Password",
                    [
                        { name: "otp", label: "6-Digit OTP", type: "text", autoFocus: true },
                        { name: "password", label: "New Password", type: "password" },
                        { name: "confirmPassword", label: "Confirm New Password", type: "password" },
                    ],
                    handleResetPassword,
                    "Reset Password",
                    "Decided not to reset?",
                    "login"
                )}
            </SignInCard>
        </BackgroundContainer>
    );
};

export default Home;