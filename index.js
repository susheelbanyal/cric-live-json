const rp = require('request-promise');
const cheerio = require('cheerio');
var Promise = require('bluebird');
const _ = require('lodash')

function getLiveScore(id){
    try{
        return rp.get('https://www.cricbuzz.com/match-api/'+id+'/commentary.json')
        .then(function(matchInfo) {
            matchInfo = JSON.parse(matchInfo);

            // check if valid id
            if (matchInfo.id) {
                const output = {
                    id: matchInfo.id,
                    type: matchInfo.type,
                    series: matchInfo.series.name,
                    series_type: matchInfo.series.type,
                    status: matchInfo.status,
                    state: matchInfo.state,
                    live_coverage: matchInfo.live_coverage,
                    startTime: matchInfo.start_time,
                    venue: { name: matchInfo.venue.name, location: matchInfo.venue.location }
                };
                if (output.state !== 'preview') {
                    const players = matchInfo.players;
                    const teams = getTeamInfo(matchInfo.team1, matchInfo.team2);
                    const score = {};
                    score.runRate = ((matchInfo || {}).score || {}).crr;
                    score.target = ((matchInfo || {}).score || {}).target;
                    score.prevOvers = ((matchInfo || {}).score || {}).prev_overs;
                    score.detail = getScoreDetails((matchInfo || {}).score, teams);
                    if (output.state == 'inprogress') {
                        score.partnership = ((matchInfo || {}).score || {}).prtshp;
                        score.batsmen = getPlayerInfo(((matchInfo || {}).score|| {}).batsman, players)
                        score.bowlers = getPlayerInfo(((matchInfo || {}).score|| {}).bowler, players)
                        score.lastBallDetail = getLastBallDetail((matchInfo || {}).comm_lines, players, (((matchInfo || {}).score || {}).prev_overs || '').trim(), score.detail.batting.overs)
                    }
                    output.score = score;
                    output.teams = teams;
                }
                return output;
            }
            throw new Error('No match found');
        });
    } catch (e) {
        throw e;
    }
}

function getLastBallDetail(comm_lines, players, prevOvers, over) {
    if(over.indexOf(".") >= 0) {
        over = parseInt(over, 10);
        over = (over-1) + '.6'
    }
    const lassBallCommentaryDetails = _.find(comm_lines, {
        o_no: over
    });
    var lassBallDetail = {};
    if (lassBallCommentaryDetails) {
         lassBallDetail = {
            batsman: getPlayerInfo(lassBallCommentaryDetails.batsman, players),
            bowler: getPlayerInfo(lassBallCommentaryDetails.bowler, players),
            events: lassBallCommentaryDetails.all_evt,
            commentary : lassBallCommentaryDetails.comm,
            score: getLastBallStatus(prevOvers),
        };   
    }
    return lassBallDetail;
}

function getLastBallStatus(prevOvers) {
    const ballArray = (prevOvers || "").split(' ');
    const lastBall = ballArray.length ? ballArray[ballArray.length - 1] === '|' ? ballArray[ballArray.length - 2] || null : ballArray[ballArray.length - 1] : "-";
    return lastBall === '.' ? 0 : lastBall;
}

function getPlayerInfo(playerArray, players){
    return playerArray.map(function(player){
        const playerDetail = getPlayerObj(player.id, players);
        player.id = playerDetail.id;
        player.name = playerDetail.f_name;
        player.shortName = playerDetail.name;
        return player;
    });
}

function getPlayerObj (id, players) {    
    return _.find(players,  {'id': id} );
}

function getTeamInfo (team1, team2) {
    const teams = {};
    const assignTeamToObject = function(team) {
        teams[team.id] = {
            id: team.id,
            name: team.name,
            shortName: team.s_name,
        }
    }
    assignTeamToObject(team1);
    assignTeamToObject(team2);
    return teams;   
}

function getScoreDetails (score, teams){
    if(score == undefined){
        return {};
    } else {
        var scoreDetail = {
            currentInnings: 1
        }

        var getInningsDetail = function (innings) {
            const inningsDetail = teams[innings.id];
            const inningsInfo = innings.innings[0];
            inningsDetail.score = inningsInfo.score;
            inningsDetail.overs = inningsInfo.overs;
            inningsDetail.wickets = inningsInfo.wkts;
            return inningsDetail;
        }


        scoreDetail.batting = getInningsDetail(score.batting);

        if (score.bowling) {
            scoreDetail.currentInnings = 2;
            scoreDetail.bowling = getInningsDetail(score.bowling);
        }

        return scoreDetail;
    }
   
}

function getRecentMatches() {
    return rp.get('http://www.cricbuzz.com')
        .then(function(cricbuzzHome) {
            const home = cheerio.load(cricbuzzHome);
            return getLiveMatchesId(home);
        })
        .then(function(liveMatchIds) {
            if (liveMatchIds.length) {
                const promises = []
                liveMatchIds.forEach(function(matchId) {
                    promises.push(getLiveScore(matchId));
                });
                return Promise.all(promises);
            }
            return [];
        });
}

function getLiveMatchesId($){
    const d1 = $('#hm-scag-mtch-blk').children()[0].children[0];
    const links = [];
    d1.children.forEach(function(matchObj){
        const link = matchObj.children[0].attribs.href;
        const linkArray = link.split('/');
        links.push(linkArray[2]);
    });
    return links;
}

module.exports = {
    getLiveScore : function(id){
        return getLiveScore(id);
    } ,
    getRecentMatches : function(){
        return getRecentMatches();
    }
}
