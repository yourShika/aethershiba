export const normalizeKey = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

export const jobEmojis: Record<string, string> = {
  paladin: '<:paladin:1416762296339796082>',
  warrior: '<:warrior:1416762313230254180>',
  darkknight: '<:darkknight:1416762343228182608>',
  gunbreaker: '<:gunbreaker:1416762355143934152>',
  whitemage: '<:whitemage:1416762368863506493>',
  scholar: '<:scholar:1416762435532230788>',
  sage: '<:sage:1416762444449185914>',
  astrologian: '<:astrologian:1416782675368218776>',
  monk: '<:monk:1416762455765422212>',
  dragoon: '<:dragoon:1416762464309346377>',
  ninja: '<:ninja:1416762475185045649>',
  samurai: '<:samurai:1416762484395872460>',
  reaper: '<:reaper:1416762504625000468>',
  viper: '<:viper:1416762526305095701>',
  bard: '<:bard:1416762589651931279>',
  machinist: '<:machinist:1416762601098055812>',
  dancer: '<:dancer:1416762611176837140>',
  blackmage: '<:blackmage:1416762624330432622>',
  summoner: '<:summoner:1416762636732858419>',
  redmage: '<:redmage:1416762646752919572>',
  pictomancer: '<:pictomancer:1416762666495639704>',
  bluemage: '<:bluemage:1416762911405248562>',
  carpenter: '<:carpenter:1416762930036478052>',
  blacksmith: '<:blacksmith:1416762941679603712>',
  armorer: '<:armorer:1416762952832389272>',
  goldsmith: '<:goldsmith:1416762972692545587>',
  leatherworker: '<:leatherworker:1416762985854013601>',
  weaver: '<:weaver:1416763031626711090>',
  alchemist: '<:alchemist:1416763041420279898>',
  culinarian: '<:culinarian:1416763048345210962>',
  miner: '<:miner:1416763058721787935>',
  botanist: '<:botanist:1416763068934783067>',
  fisher: '<:fisher:1416763074534310009>',
};

export const cityStateEmojis: Record<string, string> = {
  uldah: '<:Uldah:1416760245627130036>',
  limsalominsa: '<:Limsa_Lominsa:1416760220838924338>',
  gridania: '<:Gridania:1416760209434742878>',
};

export const JOB_CATEGORIES: Record<string, string[]> = {
    Tanks: [
        'paladin', 'warrior', 'darkknight', 'gunbreaker'
    ],
    Healers: [
        'whitemage', 'scholar', 'sage', 'astrologian'
    ],
    'Melee DPS': [
        'monk', 'dragoon', 'ninja', 'samurai', 'reaper', 'viper'
    ],
    'Physical Ranged DPS': [
        'bard', 'machinist', 'dancer'
    ],
    'Magical Ranged DPS': [
        'blackmage', 'summoner', 'redmage', 'bluemage', 'pictomancer'
    ],
    'Disciples of the Hand': [
        'carpenter', 'blacksmith', 'armorer', 'goldsmith', 'leatherworker', 'weaver', 'alchemist', 'culinarian'
    ],
    'Disciples of the Land' : [
        'miner', 'botanist', 'fisher'
    ],
};

export const companyEmojis: Record<string, string> = {
    trials: '<:Trials:1418907959592882186>',
    guildhests: '<:Guildhests:1418907951791476816>',
    casual: '<:Casual:1418907934024400956>',
    raids: '<:Raids:1418907921663922198>',
    dungeons: '<:Dungeons:1418907897944866911>',
    pvp: '<:PvP:1418907884669898752>',
    leveling: '<:Leveling:1418907839434461244>',
    'role playing': '<:RolePlaying:1418907831611949066>',
    hardcore: '<:Hardcore:1418907822044876892>',
};

export const getJobEmoji = (name: string) => jobEmojis[normalizeKey(name)];
export const getCityEmoji = (name: string) => cityStateEmojis[normalizeKey(name)];
export const getCompanyEmoji = (name: string) => companyEmojis[normalizeKey(name)];