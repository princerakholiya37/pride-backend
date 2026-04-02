const express = require("express");
const crypto = require("crypto");
const supabase = require("../supabaseClient");

const router = express.Router();

// NOTE: Keep the existing `users` table for user/driver profile data only.
// Add wallet balance and driver info columns there if needed, but do not store ride details in users.
// Example user table columns that should remain in `users`:
//   id uuid PRIMARY KEY,
//   name text,
//   email text,
//   password text,
//   mobile text,
//   role text,
//   vehicle_type text,
//   vehicle_number text,
//   wallet_balance numeric,
//   is_online boolean DEFAULT false,
//   last_online_at timestamptz,
//   is_verified boolean DEFAULT false,
//   created_at timestamptz,
//   updated_at timestamptz

// Required new table: `ride_requests`
// Create it in Supabase with this schema if it does not exist:
//   id uuid PRIMARY KEY,
//   user_id uuid REFERENCES users(id),
//   user_name text,
//   user_email text,
//   user_mobile text,
//   pickup text,
//   drop text,
//   vehicle_type text,
//   distance_km integer,
//   fare integer,
//   eta text,
//   status text,
//   driver_id uuid,
//   driver_name text,
//   driver_email text,
//   created_at timestamptz,
//   updated_at timestamptz

// SQL example:
// CREATE TABLE ride_requests (
//   id uuid PRIMARY KEY,
//   user_id uuid REFERENCES users(id),
//   user_name text,
//   user_email text,
//   user_mobile text,
//   pickup text,
//   drop text,
//   vehicle_type text,
//   distance_km integer,
//   fare integer,
//   eta text,
//   status text,
//   driver_id uuid,
//   driver_name text,
//   driver_email text,
//   created_at timestamptz,
//   updated_at timestamptz
// );

const calculateDistance = (pickup, drop) => {
  if (!pickup || !drop) return 3;
  const clean = (str) => str.trim().toLowerCase();
  if (clean(pickup) === clean(drop)) return 1;
  const pickupWords = new Set(clean(pickup).split(/\s+/));
  const dropWords = new Set(clean(drop).split(/\s+/));
  let common = 0;
  pickupWords.forEach((word) => {
    if (dropWords.has(word)) common += 1;
  });

  const lengthScore = Math.abs(pickup.length - drop.length) / 5;
  const base = 4 + lengthScore - common * 0.7;
  return Math.max(2, Math.min(25, Math.round(base)));
};

const calculateFare = (vehicle, distance) => {
  const ratePerKm = {
    bike: 15,
    auto: 25,
    truck: 40,
  };
  const rate = ratePerKm[vehicle] || 15;
  return Math.max(50, Math.round(distance * rate));
};

const calculateEta = (vehicle, distance) => {
  if (!distance) return "10 mins";
  const speed = vehicle === "truck" ? 30 : vehicle === "auto" ? 35 : 40;
  const minutes = Math.max(5, Math.round((distance / speed) * 60));
  return `${minutes} mins`;
};

router.post("/book-ride", async (req, res) => {
  const { email, pickup, drop, vehicle } = req.body;

  if (!email || !pickup || !drop || !vehicle) {
    return res.json({ success: false, message: "All ride fields are required" });
  }

  try {
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id,name,email,mobile,role")
      .eq("email", email)
      .single();

    if (userError || !user) {
      return res.json({ success: false, message: "User not found" });
    }

    if (user.role !== "user") {
      return res.json({ success: false, message: "Only users can book rides" });
    }

    const distance = calculateDistance(pickup, drop);
    const fare = calculateFare(vehicle, distance);
    const eta = calculateEta(vehicle, distance);
    const now = new Date().toISOString();

    const ride = {
      id: crypto.randomUUID(),
      user_id: user.id,
      user_name: user.name,
      user_email: user.email,
      user_mobile: user.mobile,
      pickup,
      drop,
      vehicle_type: vehicle,
      distance_km: distance,
      fare,
      eta,
      status: "requested",
      driver_id: null,
      driver_name: null,
      driver_email: null,
      created_at: now,
      updated_at: now,
    };

    const { error: insertError } = await supabase.from("ride_requests").insert([ride]);
    if (insertError) {
      return res.json({ success: false, message: "Ride request save failed" });
    }

    const { data: onlineDrivers } = await supabase
      .from("users")
      .select("id,name,email,mobile,vehicle_type,vehicle_number")
      .eq("role", "driver")
      .eq("is_online", true)
      .eq("vehicle_type", vehicle);

    return res.json({
      success: true,
      message: "Ride requested successfully",
      ride: {
        pickup,
        drop,
        vehicle,
        distance,
        fare,
        eta,
      },
      driversNotified: onlineDrivers?.length || 0,
    });
  } catch (err) {
    console.log(err);
    return res.json({ success: false, message: "Server error" });
  }
});

router.get("/ride-requests", async (req, res) => {
  const { role, email } = req.query;

  if (role !== "driver") {
    return res.json({ success: false, message: "Only drivers can fetch ride requests" });
  }

  let vehicleTypeFilter = null;
  let driverLastOnlineAt = null;
  if (email) {
    const { data: driver, error: driverError } = await supabase
      .from("users")
      .select("vehicle_type,role,is_online,last_online_at")
      .eq("email", email)
      .single();

    if (driverError || !driver || driver.role !== "driver") {
      return res.json({ success: false, message: "Driver not found" });
    }
    vehicleTypeFilter = driver.vehicle_type;
    if (driver.is_online && driver.last_online_at) {
      driverLastOnlineAt = driver.last_online_at;
    }
  }

  try {
    let query = supabase.from("ride_requests").select("*").eq("status", "requested");
    if (vehicleTypeFilter) {
      query = query.eq("vehicle_type", vehicleTypeFilter);
    }
    if (driverLastOnlineAt) {
      query = query.gte("created_at", driverLastOnlineAt);
    }
    const { data: requests, error } = await query;

    if (error) {
      return res.json({ success: false, message: "Unable to fetch ride requests" });
    }

    const response = (requests || []).map((ride) => ({
      id: ride.id,
      user_name: ride.user_name,
      user_email: ride.user_email,
      user_mobile: ride.user_mobile,
      pickup: ride.pickup,
      drop: ride.drop,
      vehicle_type: ride.vehicle_type,
      distance_km: ride.distance_km,
      fare: ride.fare,
      eta: ride.eta,
      requested_at: ride.created_at,
    }));

    return res.json({ success: true, requests: response });
  } catch (err) {
    console.log(err);
    return res.json({ success: false, message: "Server error" });
  }
});

router.patch("/ride-request/:id/accept", async (req, res) => {
  const { id } = req.params;
  const { email } = req.body;

  if (!id || !email) {
    return res.json({ success: false, message: "Ride id and driver email required" });
  }

  try {
    const { data: driver, error: driverError } = await supabase
      .from("users")
      .select("id,name,email,mobile,role")
      .eq("email", email)
      .single();

    if (driverError || !driver || driver.role !== "driver") {
      return res.json({ success: false, message: "Driver not found" });
    }

    const { data, error: updateError } = await supabase
      .from("ride_requests")
      .update({
        status: "accepted",
        driver_id: driver.id,
        driver_name: driver.name,
        driver_email: driver.email,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "requested");

    if (updateError || !data || !data.length) {
      return res.json({ success: false, message: "Ride accept failed" });
    }

    return res.json({ success: true, message: "Ride accepted" });
  } catch (err) {
    console.log(err);
    return res.json({ success: false, message: "Server error" });
  }
});

router.get("/user-rides", async (req, res) => {
  const { email } = req.query;

  if (!email) {
    return res.json({ success: false, message: "Email required" });
  }

  try {
    const { data: userRide, error } = await supabase
      .from("ride_requests")
      .select("*")
      .eq("user_email", email)
      .order("created_at", { ascending: false });

    if (error || !userRide) {
      return res.json({ success: false, message: "Unable to fetch rides" });
    }

    return res.json({ success: true, rides: userRide });
  } catch (err) {
    console.log(err);
    return res.json({ success: false, message: "Server error" });
  }
});

module.exports = router;
