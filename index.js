const express = require("express");
require("dotenv").config();
const cors = require("cors");
const app = express();
const mongoose = require("mongoose");
const port = 3002;

app.use(express.static("build"));
app.use(cors());
app.use(express.json());

mongoose
  .connect(process.env.MONGODB)
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((err) => {
    console.error("Error connecting to MongoDB", err);
  });

const playerSchema = new mongoose.Schema({
  Player: String,
  Team: String,
  Role: String,
});
const teamSchema = new mongoose.Schema({
  team: String,
  points: Number,
  players: [
    {
      Player: String,
      Role: String,
      Team: String,
      captian: { type: Boolean, default: false },
      viceCaptian: { type: Boolean, default: false },
    },
  ],
});
const matchSchema = new mongoose.Schema({
  ID: String,
  innings: Number,
  overs: Number,
  ballnumber: Number,
  batter: String,
  bowler: String,
  non_striker: String,
  extra_type: String,
  batsman_run: Number,
  extras_run: Number,
  total_run: Number,
  non_boundary: Number,
  isWicketDelivery: Number,
  player_out: String,
  kind: String,
  fielders_involved: String,
  BattingTeam: String,
});

const Player = mongoose.model("players", playerSchema);
const Match = mongoose.model("match", matchSchema);
const Team = mongoose.model("team", teamSchema);

// performance of each player will be stored in this array fter processMatch() & processBonus() runs
let pointsByPlayers = [];

//result of the match is stored here after processMatch() runs
let matchResult;

async function processMatch() {
  let match = await Match.find();
  let players = await Player.find();

  let team1 = match[0].BattingTeam;
  let team2 = match[match.length - 1].BattingTeam;
  console.log(team1, team2);
  let team1run = 0;
  let team2run = 0;

  players.map((item) =>
    pointsByPlayers.push({
      player: item.Player,
      type: item.Role,
      points: 0,
      runs: 0,
      boundaries: 0,
      sixes: 0,
      cleanWicket: 0,
      otherWicket: 0,
      catch: 0,
      stump: 0,
      runOut: 0,
      bowling: {},
    })
  );
  function updateRuns(player, runs) {
    const playerEntry = pointsByPlayers.find((item) => item.player === player);
    playerEntry.runs += runs;
    playerEntry.points += runs;
  }
  function updateBoundary(player) {
    const playerEntry = pointsByPlayers.find((item) => item.player === player);
    playerEntry.boundaries++;
    playerEntry.points += 5;
  }
  function updateSix(player) {
    const playerEntry = pointsByPlayers.find((item) => item.player === player);
    playerEntry.sixes++;
    playerEntry.points += 8;
  }
  function updateCleanWicket(player) {
    const playerEntry = pointsByPlayers.find((item) => item.player === player);
    playerEntry.cleanWicket++;
    playerEntry.points += 33;
  }
  function updateOtherWicket(player) {
    const playerEntry = pointsByPlayers.find((item) => item.player === player);
    playerEntry.otherWicket++;
    playerEntry.points += 25;
  }
  function updateCatch(player) {
    const playerEntry = pointsByPlayers.find((item) => item.player === player);
    playerEntry.catch++;
    playerEntry.points += 8;
  }
  function updateStump(player) {
    const playerEntry = pointsByPlayers.find((item) => item.player === player);
    playerEntry.stump++;
    playerEntry.points += 12;
  }
  function updateRunOut(player) {
    const playerEntry = pointsByPlayers.find((item) => item.player === player);
    playerEntry.runOut++;
    playerEntry.points += 6;
  }
  function updateBowl(player, over, runs) {
    const playerEntry = pointsByPlayers.find((item) => item.player === player);
    if (!playerEntry) {
      console.error(`Player ${player} not found.`);
      return;
    }
    if (!playerEntry.bowling[over]) {
      playerEntry.bowling[over] = [];
    }

    playerEntry.bowling[over].push(runs);
  }
  for (const item of match) {
    let bowlerRuns = item.total_run; // Default runs conceded by bowler

    // batsmen scores run
    if (item.batsman_run > 0 && item.isWicketDelivery === 0) {
      // Running between wickets
      if (item.batsman_run < 4) {
        updateRuns(item.batter, item.batsman_run);
      }
      // Boundary (4s)
      else if (item.batsman_run === 4) {
        updateBoundary(item.batter);
      }
      // Sixers
      else if (item.batsman_run === 6) {
        updateSix(item.batter);
      }
    }
    // bowler takes wicket or there is runout
    else if (item.isWicketDelivery > 0) {
      if (item.kind === "lbw" || item.kind === "bowled") {
        updateCleanWicket(item.bowler);
      } else if (item.kind === "caught") {
        updateOtherWicket(item.bowler);
        updateCatch(item.fielders_involved);
      } else if (item.kind === "stump") {
        updateOtherWicket(item.bowler);
        updateStump(item.fielders_involved);
      } else if (item.kind === "caught and bowled") {
        updateOtherWicket(item.bowler);
      } else if (item.kind === "run out") {
        updateRunOut(item.fielders_involved);
        updateRuns(item.batter, item.batsman_run);
      }
    }

    // updating runs conceeded by a bowler
    updateBowl(item.bowler, item.overs, bowlerRuns);
    if (item.innings === 1) {
      team1run += bowlerRuns;
    } else if (item.innings === 2) {
      team2run += bowlerRuns;
    }
  }
  if (team1run > team2run) {
    matchResult = `${team1} won, Points assigned to all players`;
  } else {
    matchResult = `${team2} won, Points assigned to all players`;
  }
}

function processBonus() {
  pointsByPlayers.map((player) => {
    let totalRun = player.runs + player.boundaries * 4 + player.sixes * 6;
    let totalWickets = player.cleanWicket + player.otherWicket;

    //bonus for total runs more than 30, 50, 100
    if (totalRun >= 30 && totalRun < 50) {
      player.points += 4;
    } else if (totalRun >= 50 && totalRun < 100) {
      player.points += 8;
    } else if (totalRun >= 100) {
      player.points += 16;
    }
    //minus for a duck
    if (player.type !== "BOWLER") {
      if (totalRun === 0) {
        player.points -= 2;
      }
    }

    //bonus for wickets more than 3, 4, 5
    if (totalWickets === 3) {
      player.points += 4;
    } else if (totalWickets === 4) {
      player.points += 8;
    } else if (totalWickets === 5) {
      player.points += 16;
    }

    //maiden over calculation
    if (Object.keys(player.bowling).length > 0) {
      let maiden = 0;
      for (const [over, deliveries] of Object.entries(player.bowling)) {
        if (deliveries.every((delivery) => delivery === 0)) {
          maiden++;
        }
      }
      if (maiden > 0) {
        player.points += 12;
      }
    }

    if (player.catch >= 3) {
      player.points += 4;
    }
  });
}

function getPlayerPoints(player) {
  let point = 0;
  pointsByPlayers.map((item) => {
    if (item.player === player) {
      point = item.points;
    }
  });
  return point;
}

app.get("/", async (req, res) => {
  res.send("Hello World!");
});

app.post("/add-team", async (req, res) => {
  let data = req.body;
  let wK = 0;
  let bat = 0;
  let ball = 0;
  let allRounder = 0;
  let team1 = 0;
  let team2 = 0;
  let fullData = [];

  if (!data.Team) {
    return res.status(400).send("Team name is required");
  }

  if (data.Players.length < 11) {
    return res.status(401).json({ error: "Players can't be less than 11" });
  } else if (data.Players.length > 11) {
    return res.status(401).json({ error: "Players can't be more than 11" });
  } else if (!data.Captian) {
    return res.status(401).json({ error: "Please enter a captian" });
  } else if (!data.ViceCaptian) {
    return res.status(401).json({ error: "Please enter a vice captian" });
  } else if (data.Captian === data.ViceCaptian) {
    return res
      .status(401)
      .json({ error: "Captian and vice captian can't be same" });
  }

  async function getPlayerData(name) {
    try {
      let data = await Player.find({ Player: { $in: name } });
      let modifiedData = data.map((player) => ({
        ...player.toObject(),
        captian: false,
        viceCaptian: false,
      }));
      fullData.push(...modifiedData);
    } catch (error) {
      res.send(`Unable to get Players Data from DB : ${error}`);
    }
  }
  async function getCaptianData(name) {
    try {
      let data = await Player.find({ Player: { $in: name } });
      let modifiedData = data.map((player) => ({
        ...player.toObject(),
        captian: true,
        viceCaptian: false,
      }));
      fullData.push(...modifiedData);
    } catch (error) {
      res.send(`Unable to get Captian Data from DB : ${error}`);
    }
  }
  async function getVCData(name) {
    try {
      let data = await Player.find({ Player: { $in: name } });
      let modifiedData = data.map((player) => ({
        ...player.toObject(),
        captian: false,
        viceCaptian: true,
      }));
      fullData.push(...modifiedData);
    } catch (error) {
      res.send(`Unable to get Vice Captian Data from DB : ${error}`);
    }
  }
  async function fetchAllData() {
    try {
      // filtering players array if it contains captian and vicecaptian
      let players = data.Players.filter(
        (item) => item !== data.Captian && item !== data.ViceCaptian
      );

      const promises = players.map((element) => getPlayerData(element));
      promises.push(getCaptianData(data.Captian), getVCData(data.ViceCaptian));
      await Promise.all(promises);

      // return the array in which details of all the players are stored
      return fullData;
    } catch (error) {
      throw new Error(`Unable to fetch all data: ${error}`);
    }
  }

  try {
    // fetching players data from MongoDB because we get array of players only with list of names
    let result = await fetchAllData();
    // Validating proper distribution of roles and player's team
    result.map((item) => {
      if (item.Role === "WICKETKEEPER") {
        wK++;
      } else if (item.Role === "ALL-ROUNDER") {
        allRounder++;
      } else if (item.Role === "BATTER") {
        bat++;
      } else if (item.Role === "BOWLER") {
        ball++;
      }

      if (item.Team === "Rajasthan Royals") {
        team1++;
      } else if (item.Team === "Chennai Super Kings") {
        team2++;
      }
    });
    if (wK > 8 || wK < 1) {
      return res
        .status(401)
        .json({ error: "WicketKeeper should be minimum 1 or maximum 8" });
    } else if (bat > 8 || bat < 1) {
      return res
        .status(401)
        .json({ error: "Batters should be minimum 1 or maximum 8" });
    } else if (ball > 8 || ball < 1) {
      return res
        .status(401)
        .json({ error: "Ballers should be minimum 1 or maximum 8" });
    } else if (allRounder > 8 || allRounder < 1) {
      return res
        .status(401)
        .json({ error: "Please should be minimum 1 or maximum 8" });
    } else if (team1 > 10 || team2 > 10) {
      return res
        .status(401)
        .json({ error: "Max. 10 playes can be selected from 1 team" });
    }
    // New team Object
    let completeTeam = { team: data.Team, points: 0, players: result };
    const team = new Team(completeTeam);
    await team.save();
    return res.status(200).json({ message: "Team created successfully" });
  } catch (error) {
    return res.status(401).json({ error });
  }
});

app.get("/process-result", async (req, res) => {
  try {
    if (pointsByPlayers.length === 0) {
      await processMatch();
      processBonus();
      return res.status(200).json({ matchResult, pointsByPlayers });
    } else {
      return res.status(200).json({ matchResult, pointsByPlayers });
    }
  } catch (error) {
    return res.status(500).json({ error });
  }
});

app.get("/team-result", async (req, res) => {
  try {
    let teams = await Team.find();
    let updatePromises = teams.map(async (team) => {
      if (!team.points) {
        // assuming you have a 'points' field in the team schema
        let teamPoint = 0;
        team.players.map((player) => {
          let point = getPlayerPoints(player.Player);
          console.log(point);
          if (player.captian) {
            point *= 2;
          } else if (player.viceCaptian) {
            point *= 1.5;
          }
          teamPoint += point;
        });

        // Return the promise of the update operation
        return Team.findByIdAndUpdate(team._id, { points: teamPoint });
      }
    });

    // Wait for all the update operations to complete
    await Promise.all(updatePromises);
    let resp = await Team.find();

    function findWinner() {
      let multipleTeams = [];
      let teamName;
      let maxPoints = 0;
      resp.map((team) => {
        if (team.points > maxPoints) {
          maxPoints = team.points;
          teamName = team.team;
        } else if (team.points === maxPoints) {
          multipleTeams.push(teamName, team.team);
        }
      });

      if (!multipleTeams) {
        return `${teamName} is the winner`;
      } else {
        return `${multipleTeams} are the winners`;
      }
    }
    let result = findWinner();

    return res.status(201).json({ result, resp });
  } catch (error) {
    return res
      .status(500)
      .json({ error: `Error calculating team points: ${error.message}` });
  }
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
