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
import {
    FiCheckSquare,
    FiTarget,
    FiBarChart2,
    FiZap,
    FiMail,
    FiShield,
    FiLock,
} from "react-icons/fi";

const BackgroundContainer = styled(Box)({
    height: "100dvh",
    width: "100%",
    display: "flex",
    background: "#edf4ff",
    overflow: "hidden",
    boxSizing: "border-box",

    "@media (max-width: 768px)": {
        height: "auto",
        minHeight: "100dvh",
        flexDirection: "column",
        overflow: "visible",
    },
});

const LeftPanel = styled(Box)({
    width: "43%",
    height: "100%",
    minHeight: 0,
    boxSizing: "border-box",
    padding: "20px 45px",
    position: "relative",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    color: "#fff",
    background: "linear-gradient(145deg, #3025a4 0%, #102f83 48%, #0754c4 100%)",
    clipPath: "polygon(0 0, 100% 0, 88% 100%, 0 100%)",
    zIndex: 2,

    "&::before": {
        content: '""',
        position: "absolute",
        width: "400px",
        height: "400px",
        borderRadius: "50%",
        background: "rgba(255,255,255,0.05)",
        top: "-180px",
        left: "-150px",
    },

    "&::after": {
        content: '""',
        position: "absolute",
        width: "350px",
        height: "350px",
        borderRadius: "50%",
        background: "rgba(255,255,255,0.06)",
        bottom: "-180px",
        left: "15%",
    },

    "@media (max-width: 1100px)": {
        padding: "18px 30px",
        width: "42%",
    },

    "@media (max-width: 768px)": {
        width: "100%",
        height: "auto",
        minHeight: "auto",
        padding: "30px 25px",
        clipPath: "none",
        borderRadius: "0 0 30px 30px",
    },
});

const RightPanel = styled(Box)({
    flex: 1,
    minWidth: 0,
    height: "100%",
    minHeight: 0,
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "15px 35px",
    position: "relative",
    background: "linear-gradient(145deg, #ffffff 0%, #f7faff 70%, #eaf2ff 100%)",

    "&::before": {
        content: '""',
        position: "absolute",
        width: "300px",
        height: "300px",
        borderRadius: "50%",
        background: "rgba(40, 115, 230, 0.05)",
        top: "-180px",
        right: "-100px",
    },

    "@media (max-width: 1100px)": {
        padding: "35px 25px",
    },

    "@media (max-width: 768px)": {
        height: "auto",
        minHeight: "auto",
        padding: "35px 20px 45px",
    },
});

const SignInCard = styled(Paper)({
    width: "100%",
    maxWidth: "640px",
    padding: "15px 20px",
    borderRadius: "22px",
    boxShadow: "none",
    textAlign: "center",
    backgroundColor: "transparent",
    color: "#142d64",
    position: "relative",
    zIndex: 1,

    "@media (max-width: 600px)": {
        padding: "15px 5px",
    },
});

const ActionButton = styled(Button)({
    width: "100%",
    minHeight: "62px",
    padding: "12px 22px",
    borderRadius: "13px",
    textTransform: "none",
    fontSize: "17px",
    fontWeight: 650,
    letterSpacing: "0.1px",
    transition: "all 0.25s ease",

    "&:hover": {
        transform: "translateY(-2px)",
    },

    "@media (max-width: 600px)": {
        minHeight: "55px",
        fontSize: "15px",
    },
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
                        sx={{
                            "& .MuiOutlinedInput-root": {
                                borderRadius: "11px",
                                backgroundColor: "#ffffff",

                                "&:hover fieldset": {
                                    borderColor: "#7995ca",
                                },

                                "&.Mui-focused fieldset": {
                                    borderColor: "#173eae",
                                },
                            },

                            "& .MuiInputLabel-root.Mui-focused": {
                                color: "#173eae",
                            },
                        }}
                    />
                ))}
                <ActionButton
                    type="submit"
                    fullWidth
                    variant="contained"
                    disabled={loading}
                   sx={{
                        mt: 2,
                        mb: 2,
                        minHeight: "55px",
                        borderRadius: "11px",
                        background: "linear-gradient(110deg, #142f83, #173eae)",
                        "&:hover": {
                            background: "#10266e",
                        },
                    }}
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

        {/* LEFT BRANDING PANEL */}
        <LeftPanel>

            {/* Logo and Brand Name */}
            <Box sx={{ position: "relative", zIndex: 2 }}>

                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1.5,
                        mb: 2,
                        flexWrap: "nowrap",
                    }}
                >
                    <FiCheckSquare
                        size={58}
                        color="#ffffff"
                        strokeWidth={1.8}
                    />

                    <Typography
                        sx={{
                            fontSize: {
                                xs: "25px",
                                md: "32px",
                            },
                            fontWeight: 800,
                            color: "#ffffff",
                            letterSpacing: "-1px",
                        }}
                    >
                        Checklist{" "}
                        <Box
                            component="span"
                            sx={{ color: "#ffc928" }}
                        >
                            Genie
                        </Box>
                    </Typography>
                </Box>

                <Typography
                    sx={{
                        fontSize: {
                            xs: "18px",
                            md: "22px",
                        },
                        fontWeight: 500,
                        lineHeight: 1.45,
                        maxWidth: "470px",
                        color: "#ffffff",
                    }}
                >
                    Streamline your workflow and boost productivity.
                </Typography>

                <Box
                    sx={{
                        width: 105,
                        height: 7,
                        background: "#ffc928",
                        borderRadius: 5,
                        mt: 3,
                        mb: 4,
                    }}
                />

            </Box>

            {/* Checklist Illustration */}
            <Box
                sx={{
                    position: "relative",
                    zIndex: 2,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    py: 0,
                    my: 0,
                    mt: -2,
                }}
            >

                <Box
                    sx={{
                        width: "75%",
                        maxWidth: "360px",
                        background: "linear-gradient(145deg, #66b9ff, #1263d9)",
                        borderRadius: "18px",
                        padding: "10px",
                        transform: "rotate(-4deg)",
                        boxShadow: "0 20px 35px rgba(0,0,0,0.25)",
                        border: "2px solid rgba(255,255,255,0.4)",
                    }}
                >

                    {/* Laptop top bar */}
                    <Box
                        sx={{
                            display: "flex",
                            gap: 0.7,
                            mb: 1.5,
                            px: 1,
                        }}
                    >
                        {[1, 2, 3].map((item) => (
                            <Box
                                key={item}
                                sx={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: "50%",
                                    background: "#ffffff",
                                }}
                            />
                        ))}
                    </Box>

                    {/* Checklist content */}
                    <Box
                        sx={{
                            background: "#ffffff",
                            borderRadius: "12px",
                            p: {
                                xs: 1.5,
                                md: 2,
                            },
                            minHeight: "165px",
                        }}
                    >

                        {[1, 2, 3, 4].map((item) => (
                            <Box
                                key={item}
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 2,
                                    mb: 1.2,
                                }}
                            >
                                <Box
                                    sx={{
                                        width: 35,
                                        height: 35,
                                        minWidth: 35,
                                        borderRadius: "9px",
                                        background: "#18c6a3",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                    }}
                                >
                                    <Box
                                        sx={{
                                            color: "#ffffff",
                                            fontSize: "22px",
                                            fontWeight: 800,
                                        }}
                                    >
                                        ✓
                                    </Box>
                                </Box>

                                <Box sx={{ flex: 1 }}>
                                    <Box
                                        sx={{
                                            height: 10,
                                            width: `${75 + item * 4}%`,
                                            maxWidth: "100%",
                                            background: "#a9caff",
                                            borderRadius: 5,
                                            mb: 0.8,
                                        }}
                                    />

                                    <Box
                                        sx={{
                                            height: 8,
                                            width: "55%",
                                            background: "#d5e4ff",
                                            borderRadius: 5,
                                        }}
                                    />
                                </Box>
                            </Box>
                        ))}

                    </Box>

                    {/* Laptop base */}
                    <Box
                        sx={{
                            width: "110%",
                            height: 13,
                            background: "linear-gradient(#e5f3ff, #8cb8ed)",
                            borderRadius: "0 0 12px 12px",
                            ml: "-5%",
                            mt: 1,
                        }}
                    />

                </Box>

                {/* Floating completed icon */}
                <Box
                    sx={{
                        position: "absolute",
                        right: "8%",
                        top: 0,
                        width: 65,
                        height: 65,
                        borderRadius: "50%",
                        background: "#ffc928",
                        color: "#ffffff",
                        fontSize: "35px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 8px 20px rgba(0,0,0,0.2)",
                        fontWeight: 800,
                    }}
                >
                    ✓
                </Box>

            </Box>

            {/* Productivity Features */}
            <Box
                sx={{
                    display: "flex",
                    justifyContent: "space-around",
                    alignItems: "center",
                    mt: 3,
                    position: "relative",
                    zIndex: 2,
                    width: "100%",
                }}
            >

                {[
                    {
                        icon: <FiTarget size={34} />,
                        title: "Organize",
                        subtitle: "Tasks",
                    },
                    {
                        icon: <FiBarChart2 size={34} />,
                        title: "Track",
                        subtitle: "Progress",
                    },
                    {
                        icon: <FiZap size={34} />,
                        title: "Get",
                        subtitle: "More Done",
                    },
                ].map((feature, index) => (
                    <Box
                        key={feature.title}
                        sx={{
                            flex: 1,
                            textAlign: "center",
                            borderRight:
                                index !== 2
                                    ? "1px solid rgba(255,255,255,0.3)"
                                    : "none",
                            px: 0.5,
                        }}
                    >
                        <Box
                            sx={{
                                color: "#ffc928",
                                mb: 0.5,
                                display: "flex",
                                justifyContent: "center",
                            }}
                        >
                            {feature.icon}
                        </Box>

                        <Typography
                            sx={{
                                fontSize: "14px",
                                fontWeight: 700,
                                color: "#ffffff",
                            }}
                        >
                            {feature.title}
                        </Typography>

                        <Typography
                            sx={{
                                fontSize: "15px",
                                fontWeight: 700,
                                color: "#ffffff",
                            }}
                        >
                            {feature.subtitle}
                        </Typography>
                    </Box>
                ))}

            </Box>

        </LeftPanel>
                {/* RIGHT AUTHENTICATION PANEL */}
        <RightPanel>

            <SignInCard elevation={0}>

                {/* Error and Success Messages */}
                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}

                {message && (
                    <Alert severity="success" sx={{ mb: 2 }}>
                        {message}
                    </Alert>
                )}

                {/* SOCIAL LOGIN SCREEN */}
                {view === "social" && (
                    <>

                        <Box sx={{ mb: 3 }}>

                            <Typography
                                sx={{
                                    fontSize: "18px",
                                    fontWeight: 700,
                                    letterSpacing: "5px",
                                    color: "#586789",
                                    mb: 1.5,
                                }}
                            >
                                WELCOME TO
                            </Typography>

                            <Typography
                                sx={{
                                    fontSize: {
                                        xs: "30px",
                                        sm: "40px",
                                    },
                                    fontWeight: 800,
                                    color: "#102b65",
                                    letterSpacing: "-1.5px",
                                    lineHeight: 1.2,
                                }}
                            >
                                Checklist{" "}
                                <Box
                                    component="span"
                                    sx={{ color: "#f7b916" }}
                                >
                                    Genie
                                </Box>
                            </Typography>

                            <Typography
                                sx={{
                                    mt: 2,
                                    fontSize: {
                                        xs: "15px",
                                        sm: "20px",
                                    },
                                    color: "#596987",
                                }}
                            >
                                Sign in to continue to your workspace
                            </Typography>

                        </Box>

                        {/* Social Login Buttons */}
                        <Box
                            sx={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 2,
                                width: "100%",
                            }}
                        >
                            {/* Google Sign In */}
                            <ActionButton
                                variant="outlined"
                                startIcon={<FcGoogle size={30} />}
                                onClick={handleGoogleSignIn}
                                sx={{
                                    minHeight: "58px",
                                    color: "#14264c",
                                    border: "1px solid #d5deed",
                                    backgroundColor: "#ffffff",
                                    boxShadow: "0 5px 12px rgba(20,45,90,0.08)",

                                    "&:hover": {
                                        backgroundColor: "#f8faff",
                                        borderColor: "#8ba9d9",
                                        boxShadow: "0 8px 18px rgba(20,45,90,0.13)",
                                    },
                                }}
                            >
                                Sign in with Google
                            </ActionButton>

                            {/* Microsoft Sign In */}
                            <ActionButton
                                variant="outlined"
                                startIcon={
                                    <img
                                        src="https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg"
                                        alt="Microsoft"
                                        style={{
                                            width: 27,
                                            height: 27,
                                        }}
                                    />
                                }
                                onClick={handleMicrosoftSignIn}
                                sx={{
                                    minHeight: "58px",
                                    color: "#14264c",
                                    border: "1px solid #d5deed",
                                    backgroundColor: "#ffffff",
                                    boxShadow: "0 5px 12px rgba(20,45,90,0.08)",

                                    "&:hover": {
                                        backgroundColor: "#f8faff",
                                        borderColor: "#8ba9d9",
                                        boxShadow: "0 8px 18px rgba(20,45,90,0.13)",
                                    },
                                }}
                            >
                                Sign in with Microsoft
                            </ActionButton>
                        </Box>  

                        {/* OR Divider */}
                        <Divider
                            sx={{
                                my: 2.5,
                                color: "#24447f",
                                fontWeight: 600,
                                "&::before, &::after": {
                                    borderColor: "#d4dff1",
                                },
                            }}
                        >
                            <Box
                                sx={{
                                    background: "#edf3ff",
                                    px: 2.5,
                                    py: 0.7,
                                    borderRadius: "25px",
                                }}
                            >
                                OR
                            </Box>
                        </Divider>

                        {/* Email Login */}
                        <ActionButton
                            variant="contained"
                            startIcon={<FiMail size={27} />}
                            onClick={() => {
                                setView("login");
                                resetFormState();
                            }}
                            sx={{
                                minHeight: "62px",
                                background: "linear-gradient(110deg, #142f83, #173eae)",
                                color: "#ffffff",
                                fontSize: "19px",
                                boxShadow: "0 8px 18px rgba(19,48,128,0.22)",

                                "&:hover": {
                                    background: "linear-gradient(110deg, #10266e, #123795)",
                                    boxShadow: "0 12px 24px rgba(19,48,128,0.3)",
                                },
                            }}
                        >
                            Continue with Email
                        </ActionButton>

                        {/* Security Highlights */}
                        <Box
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexWrap: "wrap",
                                gap: {
                                    xs: 2,
                                    sm: 2.5,
                                },
                                mt: 2.5,
                            }}
                        >

                            {[
                                {
                                    icon: <FiShield size={23} />,
                                    label: "Secure Login",
                                },
                                {
                                    icon: <FiLock size={23} />,
                                    label: "Your Data is Safe",
                                },
                                {
                                    icon: <FiZap size={23} />,
                                    label: "Quick Access",
                                },
                            ].map((item, index) => (
                                <Box
                                    key={item.label}
                                    sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 1,
                                        color: "#344b78",
                                        pr: {
                                            xs: 0,
                                            sm: index !== 2 ? 2.5 : 0,
                                        },
                                        borderRight: {
                                            xs: "none",
                                            sm:
                                                index !== 2
                                                    ? "1px solid #b8c9e6"
                                                    : "none",
                                        },
                                    }}
                                >
                                    {item.icon}

                                    <Typography
                                        sx={{
                                            fontSize: "14px",
                                            fontWeight: 600,
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {item.label}
                                    </Typography>
                                </Box>
                            ))}

                        </Box>

                    </>
                )}

                {/* EMAIL LOGIN */}
                {view === "login" && (
                    <>
                        {renderForm(
                            "Login",
                            [
                                {
                                    name: "email",
                                    label: "Email Address",
                                    type: "email",
                                    autoFocus: true,
                                },
                                {
                                    name: "password",
                                    label: "Password",
                                    type: "password",
                                },
                            ],
                            handleLogin,
                            "Login",
                            "Don't have an account?",
                            "register"
                        )}

                        <Box textAlign="right" sx={{ mt: 2 }}>
                            <Link
                                component="button"
                                variant="body2"
                                onClick={() => {
                                    setView("forgotPassword");
                                    resetFormState();
                                }}
                                sx={{
                                    color: "#173eae",
                                    textDecoration: "none",
                                    "&:hover": {
                                        textDecoration: "underline",
                                    },
                                }}
                            >
                                Forgot Password?
                            </Link>
                        </Box>
                    </>
                )}

                {/* REGISTRATION */}
                {view === "register" &&
                    renderForm(
                        "Create Account",
                        [
                            {
                                name: "name",
                                label: "Full Name",
                                type: "text",
                                autoFocus: true,
                            },
                            {
                                name: "email",
                                label: "Email Address",
                                type: "email",
                            },
                            {
                                name: "password",
                                label: "Password",
                                type: "password",
                            },
                            {
                                name: "organisationName",
                                label: "Organisation Name",
                                type: "text",
                            },
                        ],
                        handleRegister,
                        "Register & Get OTP",
                        "Already have an account?",
                        "login"
                    )
                }

                {/* OTP VERIFICATION */}
                {view === "otp" &&
                    renderForm(
                        "Verify OTP",
                        [
                            {
                                name: "otp",
                                label: "6-Digit OTP",
                                type: "text",
                                autoFocus: true,
                            },
                        ],
                        handleVerifyOtp,
                        "Verify & Complete",
                        "Didn't get an OTP?",
                        "register"
                    )
                }

                {/* FORGOT PASSWORD */}
                {view === "forgotPassword" &&
                    renderForm(
                        "Forgot Password",
                        [
                            {
                                name: "email",
                                label: "Enter your registered email",
                                type: "email",
                                autoFocus: true,
                            },
                        ],
                        handleRequestPasswordReset,
                        "Send Reset OTP",
                        "Remember your password?",
                        "login"
                    )
                }

                {/* RESET PASSWORD */}
                {view === "resetPassword" &&
                    renderForm(
                        "Reset Your Password",
                        [
                            {
                                name: "otp",
                                label: "6-Digit OTP",
                                type: "text",
                                autoFocus: true,
                            },
                            {
                                name: "password",
                                label: "New Password",
                                type: "password",
                            },
                            {
                                name: "confirmPassword",
                                label: "Confirm New Password",
                                type: "password",
                            },
                        ],
                        handleResetPassword,
                        "Reset Password",
                        "Decided not to reset?",
                        "login"
                    )
                }

            </SignInCard>

        </RightPanel>

    </BackgroundContainer>
    );
};

export default Home;