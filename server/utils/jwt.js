

const jwt = require('jsonwebtoken');

const generateToken = (user) => {
  return jwt.sign(
    {
      organisation_id: user.organisation,
      organisation_user_id: user.organisation_user_id,
      user_id: user.user_id,
      email: user.email,
      name: user.name,
      user_type: user.user_type, 
    },
    process.env.SECRET
  );
};

const authentication = (req, res, next) => {
  const authHeaders = req.headers.authorization;

  if (!authHeaders || !authHeaders.startsWith('Bearer ')) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const token = authHeaders.split(' ')[1];
    const verified = jwt.verify(token, process.env.SECRET);
    req.user = verified;
    next();
  } catch (error) {
    console.log(error);
    return res.status(401).json({ error: "Invalid or expired token." });
  }
};

module.exports = { generateToken, authentication };