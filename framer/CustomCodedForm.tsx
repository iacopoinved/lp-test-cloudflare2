// @ts-nocheck — paste-only Framer component; React runtime is provided by Framer, not this repo
import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import { addPropertyControls, ControlType } from 'framer';

// :gear: === À MODIFIER ICI ===
// The Cloudflare Worker URL (from `npm run deploy`). It replaces the old
// direct Make webhook URL — the Make URL now lives only as a Worker secret.
const WORKER_URL = 'https://nameless-wind-d395.inved-sa.workers.dev';
// Your Turnstile *site key* (public) from the Cloudflare dashboard widget.
const TURNSTILE_SITE_KEY = '0x4AAAAAADpuGe23L76ed_HY';
const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback&render=explicit';
const REDIRECT_URL = 'https://sommet.inved.ch/thank-you';
// Clé localStorage : on sauvegarde le formulaire à chaque frappe pour que,
// si iOS/WebKit recharge l'onglet (crash déclenché par le challenge), les
// champs se re-remplissent tout seuls au lieu de repartir vides. On utilise
// localStorage (et pas sessionStorage) car un crash de process iOS peut vider
// sessionStorage, alors que localStorage survit — c'est justement le cas
// "mon téléphone a planté" qu'on veut rattraper.
const STORAGE_KEY = 'inved_lead_form_v1';
// Durée de vie de la sauvegarde (ms). Au-delà, on considère que ce n'est plus
// la même session de remplissage et on repart d'un formulaire vierge — évite
// de pré-remplir avec de vieilles données lors d'une visite ultérieure.
const STORAGE_TTL_MS = 60 * 60 * 1000; // 60 min
// Nom du champ "pot de miel" (honeypot) : invisible pour un humain, souvent
// rempli par les bots. DOIT correspondre à HONEYPOT_FIELD dans le Worker.
const HONEYPOT_FIELD = 'company_website';
// ==============================

// Lecture d'un formulaire précédemment sauvegardé. Renvoie {} si rien n'est
// stocké, si la sauvegarde a expiré, ou si l'environnement n'a pas de
// localStorage (SSR / preview).
function loadSaved(): Record<string, string> {
	try {
		if (typeof window === 'undefined' || !window.localStorage) return {};
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return {};
		const data = JSON.parse(raw);
		const savedAt = Number(data && data.savedAt);
		if (!Number.isFinite(savedAt) || Date.now() - savedAt > STORAGE_TTL_MS) {
			window.localStorage.removeItem(STORAGE_KEY);
			return {};
		}
		return data;
	} catch {
		return {};
	}
}

// Define a comprehensive list of countries with their ISO codes and dialing codes
const countries = [
	{ name: 'Afghanistan', code: 'AF', dialCode: '+93' },
	{ name: 'Afrique du Sud', code: 'ZA', dialCode: '+27' },
	{ name: 'Albanie', code: 'AL', dialCode: '+355' },
	{ name: 'Algérie', code: 'DZ', dialCode: '+213' },
	{ name: 'Allemagne', code: 'DE', dialCode: '+49' },
	{ name: 'Andorre', code: 'AD', dialCode: '+376' },
	{ name: 'Angola', code: 'AO', dialCode: '+244' },
	{ name: 'Antigua-et-Barbuda', code: 'AG', dialCode: '+1-268' },
	{ name: 'Arabie saoudite', code: 'SA', dialCode: '+966' },
	{ name: 'Argentine', code: 'AR', dialCode: '+54' },
	{ name: 'Arménie', code: 'AM', dialCode: '+374' },
	{ name: 'Australie', code: 'AU', dialCode: '+61' },
	{ name: 'Autriche', code: 'AT', dialCode: '+43' },
	{ name: 'Azerbaïdjan', code: 'AZ', dialCode: '+994' },
	{ name: 'Bahamas', code: 'BS', dialCode: '+1-242' },
	{ name: 'Bahreïn', code: 'BH', dialCode: '+973' },
	{ name: 'Bangladesh', code: 'BD', dialCode: '+880' },
	{ name: 'Barbade', code: 'BB', dialCode: '+1-246' },
	{ name: 'Belgique', code: 'BE', dialCode: '+32' },
	{ name: 'Belize', code: 'BZ', dialCode: '+501' },
	{ name: 'Bénin', code: 'BJ', dialCode: '+229' },
	{ name: 'Bhoutan', code: 'BT', dialCode: '+975' },
	{ name: 'Biélorussie', code: 'BY', dialCode: '+375' },
	{ name: 'Birmanie', code: 'MM', dialCode: '+95' },
	{ name: 'Bolivie', code: 'BO', dialCode: '+591' },
	{ name: 'Bosnie-Herzégovine', code: 'BA', dialCode: '+387' },
	{ name: 'Botswana', code: 'BW', dialCode: '+267' },
	{ name: 'Brésil', code: 'BR', dialCode: '+55' },
	{ name: 'Brunei', code: 'BN', dialCode: '+673' },
	{ name: 'Bulgarie', code: 'BG', dialCode: '+359' },
	{ name: 'Burkina Faso', code: 'BF', dialCode: '+226' },
	{ name: 'Burundi', code: 'BI', dialCode: '+257' },
	{ name: 'Cambodge', code: 'KH', dialCode: '+855' },
	{ name: 'Cameroun', code: 'CM', dialCode: '+237' },
	{ name: 'Canada', code: 'CA', dialCode: '+1' },
	{ name: 'Cap-Vert', code: 'CV', dialCode: '+238' },
	{ name: 'Chili', code: 'CL', dialCode: '+56' },
	{ name: 'Chine', code: 'CN', dialCode: '+86' },
	{ name: 'Chypre', code: 'CY', dialCode: '+357' },
	{ name: 'Colombie', code: 'CO', dialCode: '+57' },
	{ name: 'Comores', code: 'KM', dialCode: '+269' },
	{ name: 'Corée du Nord', code: 'KP', dialCode: '+850' },
	{ name: 'Corée du Sud', code: 'KR', dialCode: '+82' },
	{ name: 'Costa Rica', code: 'CR', dialCode: '+506' },
	{ name: 'Côte d’Ivoire', code: 'CI', dialCode: '+225' },
	{ name: 'Croatie', code: 'HR', dialCode: '+385' },
	{ name: 'Cuba', code: 'CU', dialCode: '+53' },
	{ name: 'Danemark', code: 'DK', dialCode: '+45' },
	{ name: 'Djibouti', code: 'DJ', dialCode: '+253' },
	{ name: 'Dominique', code: 'DM', dialCode: '+1-767' },
	{ name: 'Égypte', code: 'EG', dialCode: '+20' },
	{ name: 'Émirats arabes unis', code: 'AE', dialCode: '+971' },
	{ name: 'Équateur', code: 'EC', dialCode: '+593' },
	{ name: 'Érythrée', code: 'ER', dialCode: '+291' },
	{ name: 'Espagne', code: 'ES', dialCode: '+34' },
	{ name: 'Estonie', code: 'EE', dialCode: '+372' },
	{ name: 'Eswatini', code: 'SZ', dialCode: '+268' },
	{ name: 'États-Unis', code: 'US', dialCode: '+1' },
	{ name: 'Éthiopie', code: 'ET', dialCode: '+251' },
	{ name: 'Fidji', code: 'FJ', dialCode: '+679' },
	{ name: 'Finlande', code: 'FI', dialCode: '+358' },
	{ name: 'France', code: 'FR', dialCode: '+33' },
	{ name: 'Gabon', code: 'GA', dialCode: '+241' },
	{ name: 'Gambie', code: 'GM', dialCode: '+220' },
	{ name: 'Géorgie', code: 'GE', dialCode: '+995' },
	{ name: 'Ghana', code: 'GH', dialCode: '+233' },
	{ name: 'Grèce', code: 'GR', dialCode: '+30' },
	{ name: 'Grenade', code: 'GD', dialCode: '+1-473' },
	{ name: 'Guatemala', code: 'GT', dialCode: '+502' },
	{ name: 'Guinée', code: 'GN', dialCode: '+224' },
	{ name: 'Guinée-Bissau', code: 'GW', dialCode: '+245' },
	{ name: 'Guinée équatoriale', code: 'GQ', dialCode: '+240' },
	{ name: 'Guyana', code: 'GY', dialCode: '+592' },
	{ name: 'Haïti', code: 'HT', dialCode: '+509' },
	{ name: 'Honduras', code: 'HN', dialCode: '+504' },
	{ name: 'Hongrie', code: 'HU', dialCode: '+36' },
	{ name: 'Îles Marshall', code: 'MH', dialCode: '+692' },
	{ name: 'Îles Salomon', code: 'SB', dialCode: '+677' },
	{ name: 'Inde', code: 'IN', dialCode: '+91' },
	{ name: 'Indonésie', code: 'ID', dialCode: '+62' },
	{ name: 'Irak', code: 'IQ', dialCode: '+964' },
	{ name: 'Iran', code: 'IR', dialCode: '+98' },
	{ name: 'Irlande', code: 'IE', dialCode: '+353' },
	{ name: 'Islande', code: 'IS', dialCode: '+354' },
	{ name: 'Israël', code: 'IL', dialCode: '+972' },
	{ name: 'Italie', code: 'IT', dialCode: '+39' },
	{ name: 'Jamaïque', code: 'JM', dialCode: '+1-876' },
	{ name: 'Japon', code: 'JP', dialCode: '+81' },
	{ name: 'Jordanie', code: 'JO', dialCode: '+962' },
	{ name: 'Kazakhstan', code: 'KZ', dialCode: '+7' },
	{ name: 'Kenya', code: 'KE', dialCode: '+254' },
	{ name: 'Kirghizistan', code: 'KG', dialCode: '+996' },
	{ name: 'Kiribati', code: 'KI', dialCode: '+686' },
	{ name: 'Kosovo', code: 'XK', dialCode: '+383' },
	{ name: 'Koweït', code: 'KW', dialCode: '+965' },
	{ name: 'Laos', code: 'LA', dialCode: '+856' },
	{ name: 'Lesotho', code: 'LS', dialCode: '+266' },
	{ name: 'Lettonie', code: 'LV', dialCode: '+371' },
	{ name: 'Liban', code: 'LB', dialCode: '+961' },
	{ name: 'Libéria', code: 'LR', dialCode: '+231' },
	{ name: 'Libye', code: 'LY', dialCode: '+218' },
	{ name: 'Liechtenstein', code: 'LI', dialCode: '+423' },
	{ name: 'Lituanie', code: 'LT', dialCode: '+370' },
	{ name: 'Luxembourg', code: 'LU', dialCode: '+352' },
	{ name: 'Macédoine du Nord', code: 'MK', dialCode: '+389' },
	{ name: 'Madagascar', code: 'MG', dialCode: '+261' },
	{ name: 'Malaisie', code: 'MY', dialCode: '+60' },
	{ name: 'Malawi', code: 'MW', dialCode: '+265' },
	{ name: 'Maldives', code: 'MV', dialCode: '+960' },
	{ name: 'Mali', code: 'ML', dialCode: '+223' },
	{ name: 'Malte', code: 'MT', dialCode: '+356' },
	{ name: 'Maroc', code: 'MA', dialCode: '+212' },
	{ name: 'Maurice', code: 'MU', dialCode: '+230' },
	{ name: 'Mauritanie', code: 'MR', dialCode: '+222' },
	{ name: 'Mexique', code: 'MX', dialCode: '+52' },
	{ name: 'Micronésie', code: 'FM', dialCode: '+691' },
	{ name: 'Moldavie', code: 'MD', dialCode: '+373' },
	{ name: 'Monaco', code: 'MC', dialCode: '+377' },
	{ name: 'Mongolie', code: 'MN', dialCode: '+976' },
	{ name: 'Monténégro', code: 'ME', dialCode: '+382' },
	{ name: 'Mozambique', code: 'MZ', dialCode: '+258' },
	{ name: 'Namibie', code: 'NA', dialCode: '+264' },
	{ name: 'Nauru', code: 'NR', dialCode: '+674' },
	{ name: 'Népal', code: 'NP', dialCode: '+977' },
	{ name: 'Nicaragua', code: 'NI', dialCode: '+505' },
	{ name: 'Niger', code: 'NE', dialCode: '+227' },
	{ name: 'Nigéria', code: 'NG', dialCode: '+234' },
	{ name: 'Norvège', code: 'NO', dialCode: '+47' },
	{ name: 'Nouvelle-Zélande', code: 'NZ', dialCode: '+64' },
	{ name: 'Oman', code: 'OM', dialCode: '+968' },
	{ name: 'Ouganda', code: 'UG', dialCode: '+256' },
	{ name: 'Ouzbékistan', code: 'UZ', dialCode: '+998' },
	{ name: 'Pakistan', code: 'PK', dialCode: '+92' },
	{ name: 'Palaos', code: 'PW', dialCode: '+680' },
	{ name: 'Panama', code: 'PA', dialCode: '+507' },
	{ name: 'Papouasie-Nouvelle-Guinée', code: 'PG', dialCode: '+675' },
	{ name: 'Paraguay', code: 'PY', dialCode: '+595' },
	{ name: 'Pays-Bas', code: 'NL', dialCode: '+31' },
	{ name: 'Pérou', code: 'PE', dialCode: '+51' },
	{ name: 'Philippines', code: 'PH', dialCode: '+63' },
	{ name: 'Pologne', code: 'PL', dialCode: '+48' },
	{ name: 'Portugal', code: 'PT', dialCode: '+351' },
	{ name: 'Qatar', code: 'QA', dialCode: '+974' },
	{ name: 'République centrafricaine', code: 'CF', dialCode: '+236' },
	{ name: 'République démocratique du Congo', code: 'CD', dialCode: '+243' },
	{ name: 'République dominicaine', code: 'DO', dialCode: '+1-809' },
	{ name: 'République du Congo', code: 'CG', dialCode: '+242' },
	{ name: 'République tchèque', code: 'CZ', dialCode: '+420' },
	{ name: 'Roumanie', code: 'RO', dialCode: '+40' },
	{ name: 'Russie', code: 'RU', dialCode: '+7' },
	{ name: 'Rwanda', code: 'RW', dialCode: '+250' },
	{ name: 'Saint-Kitts-et-Nevis', code: 'KN', dialCode: '+1-869' },
	{ name: 'Saint-Marin', code: 'SM', dialCode: '+378' },
	{
		name: 'Saint-Vincent-et-les-Grenadines',
		code: 'VC',
		dialCode: '+1-784',
	},
	{ name: 'Sainte-Lucie', code: 'LC', dialCode: '+1-758' },
	{ name: 'Salvador', code: 'SV', dialCode: '+503' },
	{ name: 'Samoa', code: 'WS', dialCode: '+685' },
	{ name: 'Sao Tomé-et-Principe', code: 'ST', dialCode: '+239' },
	{ name: 'Sénégal', code: 'SN', dialCode: '+221' },
	{ name: 'Serbie', code: 'RS', dialCode: '+381' },
	{ name: 'Seychelles', code: 'SC', dialCode: '+248' },
	{ name: 'Sierra Leone', code: 'SL', dialCode: '+232' },
	{ name: 'Singapour', code: 'SG', dialCode: '+65' },
	{ name: 'Slovaquie', code: 'SK', dialCode: '+421' },
	{ name: 'Slovénie', code: 'SI', dialCode: '+386' },
	{ name: 'Somalie', code: 'SO', dialCode: '+252' },
	{ name: 'Soudan', code: 'SD', dialCode: '+249' },
	{ name: 'Soudan du Sud', code: 'SS', dialCode: '+211' },
	{ name: 'Sri Lanka', code: 'LK', dialCode: '+94' },
	{ name: 'Suède', code: 'SE', dialCode: '+46' },
	{ name: 'Suisse', code: 'CH', dialCode: '+41' },
	{ name: 'Suriname', code: 'SR', dialCode: '+597' },
	{ name: 'Syrie', code: 'SY', dialCode: '+963' },
	{ name: 'Tadjikistan', code: 'TJ', dialCode: '+992' },
	{ name: 'Taïwan', code: 'TW', dialCode: '+886' },
	{ name: 'Tanzanie', code: 'TZ', dialCode: '+255' },
	{ name: 'Tchad', code: 'TD', dialCode: '+235' },
	{ name: 'Thaïlande', code: 'TH', dialCode: '+66' },
	{ name: 'Timor oriental', code: 'TL', dialCode: '+670' },
	{ name: 'Togo', code: 'TG', dialCode: '+228' },
	{ name: 'Tonga', code: 'TO', dialCode: '+676' },
	{ name: 'Trinité-et-Tobago', code: 'TT', dialCode: '+1-868' },
	{ name: 'Tunisie', code: 'TN', dialCode: '+216' },
	{ name: 'Turkménistan', code: 'TM', dialCode: '+993' },
	{ name: 'Turquie', code: 'TR', dialCode: '+90' },
	{ name: 'Tuvalu', code: 'TV', dialCode: '+688' },
	{ name: 'Ukraine', code: 'UA', dialCode: '+380' },
	{ name: 'Uruguay', code: 'UY', dialCode: '+598' },
	{ name: 'Vanuatu', code: 'VU', dialCode: '+678' },
	{ name: 'Vatican', code: 'VA', dialCode: '+379' },
	{ name: 'Venezuela', code: 'VE', dialCode: '+58' },
	{ name: 'Viêt Nam', code: 'VN', dialCode: '+84' },
	{ name: 'Yémen', code: 'YE', dialCode: '+967' },
	{ name: 'Zambie', code: 'ZM', dialCode: '+260' },
	{ name: 'Zimbabwe', code: 'ZW', dialCode: '+263' },
];

declare global {
	interface Window {
		dataLayer?: any[];
		turnstile?: {
			render: (el: HTMLElement, opts: Record<string, unknown>) => string;
			reset: (id?: string) => void;
			execute: (id?: string) => void;
			getResponse: (id?: string) => string | undefined;
		};
		onloadTurnstileCallback?: () => void;
	}
}

export function CustomCodedHubSpotForm(props: any) {
	const { headline, namePlaceholder, emailPlaceholder, phonePlaceholder, buttonText } = props;

	// Restauration éventuelle d'un formulaire sauvegardé (voir STORAGE_KEY).
	const [restored] = useState(loadSaved);
	// Vrai si l'utilisateur avait réellement commencé à remplir avant le
	// rechargement (au moins un champ saisi) — déclenche le retour au
	// formulaire.
	const wasRestored = !!(restored.name || restored.email || restored.phoneNumber);

	// Initialize state variables
	const [name, setName] = useState(restored.name || '');
	const [email, setEmail] = useState(restored.email || '');
	const [selectedCountry, setSelectedCountry] = useState(
		() => countries.find((c) => c.code === restored.countryCode) || countries.find((c) => c.code === 'CH') || countries[0],
	);
	const [phoneNumber, setPhoneNumber] = useState(restored.phoneNumber || '');
	const [errors, setErrors] = useState({});
	const [isSubmitting, setIsSubmitting] = useState(false);
	// Honeypot anti-bot : champ caché que seuls les robots remplissent.
	const [botField, setBotField] = useState('');

	const widgetRef = useRef<HTMLDivElement>(null);
	const widgetId = useRef<string | null>(null);
	const formRef = useRef<HTMLFormElement>(null);
	// Horodatage d'ouverture du formulaire : sert au Worker à repérer les
	// soumissions "trop rapides" (signal bot, non bloquant).
	const loadedAtRef = useRef(Date.now());

	// State for button hover and pressed states
	const [isHovering, setIsHovering] = useState(false);
	const [isPressed, setIsPressed] = useState(false);

	// Fetch user's country code on component mount
	useEffect(() => {
		const fetchCountry = async () => {
			try {
				const response = await fetch('https://ipapi.co/json/');
				const data = await response.json();
				const countryCode = data.country_code;
				const country = countries.find((c) => c.code === countryCode);
				if (country) {
					setSelectedCountry(country);
				}
			} catch (error) {
				console.error('Error fetching user country', error);
				// Keep default country if error occurs
			}
		};

		// Si l'utilisateur avait déjà choisi un pays (formulaire restauré), on
		// respecte son choix au lieu de le remplacer par la géoloc.
		if (!restored.countryCode) fetchCountry();
	}, []);

	// Load the Turnstile script once and render the widget explicitly.
	//
	// CHANGEMENT IMPORTANT (fix iOS) : plus de `execution: "execute"`.
	// Le challenge tourne maintenant en arrière-plan dès l'ouverture du
	// formulaire (mode "render", le défaut), et le token est déjà prêt au
	// moment du submit. Avant, le challenge (calcul lourd, proof-of-work)
	// se lançait au moment exact du clic sur "Envoyer" — et sur iOS
	// (WebKit, bug connu iOS 26.5.x), ce calcul pouvait tuer l'onglet :
	// page blanche → rechargement automatique → inscription perdue.
	useEffect(() => {
		if (!TURNSTILE_SITE_KEY || TURNSTILE_SITE_KEY.includes('REPLACE_ME')) return;

		function renderWidget() {
			if (!window.turnstile || !widgetRef.current || widgetId.current) return;
			widgetId.current = window.turnstile.render(widgetRef.current, {
				sitekey: TURNSTILE_SITE_KEY,
				// Invisible (zéro espace) sauf si un challenge interactif est
				// réellement requis ; le token est émis silencieusement pour
				// les visiteurs normaux.
				appearance: 'interaction-only',
				// IMPORTANT (iPhone) : chaque exécution du challenge est un
				// risque de crash de l'onglet sur iOS/WebKit. On interdit donc
				// au widget de relancer des challenges tout seul :
				// - pas de renouvellement auto du token expiré (par défaut
				//   Turnstile relance un challenge toutes les ~5 min),
				// - pas de re-tentative auto en cas d'échec (par défaut
				//   Turnstile réessaie toutes les 8 s, en boucle).
				// Le challenge tourne UNE fois à l'ouverture du formulaire ;
				// si le token manque ou a expiré au moment du submit, le
				// fallback de getToken() en relance un seul, avec timeout.
				'refresh-expired': 'never',
				retry: 'never',
				// Le token est lu via getResponse() au moment du submit ; pas
				// besoin de le capturer ici. Callbacks vides = le widget ne
				// relance jamais rien de lui-même (une seule exécution du
				// challenge, à l'ouverture → moins de risque de gel WebKit).
				callback: () => {},
				'error-callback': () => {},
			});
		}

		if (window.turnstile) {
			renderWidget();
			return;
		}

		window.onloadTurnstileCallback = renderWidget;

		if (!document.querySelector(`script[src^="${TURNSTILE_SRC.split('?')[0]}"]`)) {
			const s = document.createElement('script');
			s.src = TURNSTILE_SRC;
			s.async = true;
			s.defer = true;
			document.head.appendChild(s);
		}
	}, []);

	// Tracking affichage du formulaire
	useEffect(() => {
		try {
			window.dataLayer = window.dataLayer || [];

			window.dataLayer.push({
				event: 'view_call_section',
			});
		} catch (e) {
			console.error('Erreur push dataLayer form_view', e);
		}
	}, []);

	// Sauvegarde continue du formulaire dans localStorage. Si iOS/WebKit
	// recharge l'onglet pendant que le challenge tourne, l'utilisateur
	// retrouve ses champs déjà remplis au lieu d'un formulaire vide.
	useEffect(() => {
		try {
			window.localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({ name, email, phoneNumber, countryCode: selectedCountry.code, savedAt: Date.now() }),
			);
		} catch (e) {}
	}, [name, email, phoneNumber, selectedCountry]);

	// Reprise après rechargement : si l'utilisateur était en train de remplir
	// le formulaire quand la page s'est rechargée (ex. gel de l'onglet iOS),
	// on le ramène DIRECTEMENT au formulaire déjà pré-rempli plutôt que de le
	// laisser en haut de la landing page. Aucun message : la reprise est
	// silencieuse (le formulaire est simplement déjà rempli, à l'écran).
	useEffect(() => {
		if (!wasRestored) return;
		// Petit délai pour laisser la page Framer finir sa mise en page
		// (polices/images) avant de cibler la position du formulaire.
		const scrollTimer = setTimeout(() => {
			try {
				formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			} catch (e) {}
		}, 400);
		return () => clearTimeout(scrollTimer);
	}, []);

	// Handle country selection change
	const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		const selectedCode = e.target.value;
		const country = countries.find((c) => c.code === selectedCode);
		setSelectedCountry(country);
	};

	// Handle input changes
	const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setName(e.target.value);
	};

	const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setEmail(e.target.value);
	};

	const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const input = e.target.value;
		const digits = input.replace(/\D/g, '');
		setPhoneNumber(digits);
	};

	// Récupère le token Turnstile s'il est DÉJÀ prêt (le challenge tourne en
	// arrière-plan depuis l'ouverture du formulaire). NON bloquant : si le
	// token n'est pas encore là (réseau lent / iOS), on renvoie '' et on
	// soumet quand même — le Worker acceptera le lead en le marquant
	// "non vérifié". Objectif : ne JAMAIS faire attendre ni perdre un lead
	// payant. Pas de reset() ici : chaque exécution du challenge est un
	// risque de gel de l'onglet sur WebKit.
	const getToken = (): string => {
		try {
			if (window.turnstile && widgetId.current) {
				return window.turnstile.getResponse(widgetId.current) || '';
			}
		} catch (e) {
			// widget dans un état invalide → pas de token
		}
		return '';
	};

	const submitForm = async (e: React.FormEvent<HTMLFormElement>) => {
		if (e) e.preventDefault();
		if (isSubmitting) return;

		// Validate fields
		const newErrors: Record<string, string> = {};

		if (!name.trim()) {
			newErrors.name = 'Le prénom est requis';
		}

		if (!email.trim()) {
			newErrors.email = "L'adresse e-mail est requise";
		} else {
			// Simple email validation
			const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
			if (!emailRegex.test(email)) {
				newErrors.email = 'Veuillez saisir une adresse e-mail valide';
			}
		}

		if (!phoneNumber.trim()) {
			newErrors.phoneNumber = 'Le numéro de téléphone est requis';
		} else if (selectedCountry.code === 'CH') {
			// Validation du format suisse uniquement
			const swissNumber = phoneNumber.replace(/^0/, ''); // on enlève un éventuel 0 initial
			const swissPhoneRegex = /^[2-9]\d{8}$/;
			if (!swissPhoneRegex.test(swissNumber)) {
				newErrors.phoneNumber = "Le numéro de téléphone n'est pas valide";
			}
		}

		// If there are errors, prevent submission
		if (Object.keys(newErrors).length > 0) {
			setErrors(newErrors);
			return;
		} else {
			setErrors({});
		}

		// Get URL parameters
		const urlParams = new URLSearchParams(window.location.search);

		// Extract UTM parameters
		const utmCampaign = urlParams.get('utm_campaign') || '';
		const utmMedium = urlParams.get('utm_medium') || '';
		const utmSource = urlParams.get('utm_source') || '';
		const utmTerm = urlParams.get('utm_term') || '';
		const utmContent = urlParams.get('utm_content') || '';

		// Format du numéro : on retire le 0 initial pour la Suisse
		const localNumber = selectedCountry.code === 'CH' ? phoneNumber.replace(/^0/, '') : phoneNumber;
		const fullPhoneNumber = selectedCountry.dialCode + localNumber;

		// === Toutes les données du formulaire dans un seul objet ===
		const formData = {
			firstname: name,
			email: email,
			phone: fullPhoneNumber,
			country: selectedCountry.code,
			utm_source: utmSource,
			utm_medium: utmMedium,
			utm_campaign: utmCampaign,
			utm_term: utmTerm,
			utm_content: utmContent,
			page_uri: window.location.href,
		};

		// === Tracking GTM (optionnel — supprime ce bloc si tu n'utilises pas GTM) ===
		try {
			window.dataLayer = window.dataLayer || [];
			window.dataLayer.push({
				event: 'generate_lead',
				timestamp: new Date().toISOString(),
				...formData,
			});
		} catch (e) {
			console.error('Erreur push dataLayer', e);
		}

		// === Envoi vers le Worker Cloudflare (qui vérifie Turnstile si un token
		// est présent, puis relaie vers Make en marquant le lead vérifié ou non) ===
		setIsSubmitting(true);
		const turnstileToken = getToken();
		const payload: Record<string, unknown> = {
			...formData,
			[HONEYPOT_FIELD]: botField,
			elapsed_ms: Date.now() - loadedAtRef.current,
		};
		// On n'attache le token QUE s'il est déjà prêt : le submit n'attend
		// jamais Turnstile (capture-first). Sans token, le Worker accepte
		// quand même et marque verified=false.
		if (turnstileToken) payload['cf-turnstile-response'] = turnstileToken;

		try {
			const res = await fetch(WORKER_URL, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data?.error || `Échec de l'envoi (${res.status})`);
			}
		} catch (error) {
			console.error("Erreur lors de l'envoi vers le Worker", error);
			setErrors({
				submit: 'Une erreur est survenue. Merci de réessayer.',
			});
			setIsSubmitting(false);
			return;
		}

		// Succès : on efface la sauvegarde pour ne pas re-remplir le
		// formulaire lors d'une prochaine visite.
		try {
			window.localStorage.removeItem(STORAGE_KEY);
		} catch (e) {}

		// Prepare the redirect URL and query parameters
		let redirectUrl = REDIRECT_URL;
		const queryParams = [];

		// Append UTM parameters to the redirect URL if they exist
		if (utmSource) queryParams.push('utm_source=' + encodeURIComponent(utmSource));
		if (utmMedium) queryParams.push('utm_medium=' + encodeURIComponent(utmMedium));
		if (utmCampaign) queryParams.push('utm_campaign=' + encodeURIComponent(utmCampaign));
		if (utmTerm) queryParams.push('utm_term=' + encodeURIComponent(utmTerm));
		if (utmContent) queryParams.push('utm_content=' + encodeURIComponent(utmContent));

		// Append form input values
		if (email) queryParams.push('email=' + encodeURIComponent(email));
		if (name) queryParams.push('name=' + encodeURIComponent(name));
		if (phoneNumber) {
			queryParams.push('phone=' + encodeURIComponent(fullPhoneNumber));
		}
		if (selectedCountry.code) queryParams.push('country=' + encodeURIComponent(selectedCountry.code));

		// Construct the final URL
		const finalUrl = redirectUrl + (queryParams.length ? '?' + queryParams.join('&') : '');

		// Redirect to the final URL
		(window.top ?? window).location.href = finalUrl;
	};

	// Dynamic button styles based on state
	const getButtonStyle = () => {
		let buttonStyle = { ...styles.button };

		if (isPressed) {
			buttonStyle = { ...buttonStyle, ...styles.buttonPressed };
		} else if (isHovering) {
			buttonStyle = { ...buttonStyle, ...styles.buttonHover };
		}

		return buttonStyle;
	};

	return (
		<form ref={formRef} style={styles.formContainer} onSubmit={submitForm}>
			<div style={styles.headline}>{headline}</div>
			<input type="text" placeholder={namePlaceholder} style={styles.input} value={name} onChange={handleNameChange} />
			{errors.name && <div style={styles.errorText}>{errors.name}</div>}
			<input type="email" placeholder={emailPlaceholder} style={styles.input} value={email} onChange={handleEmailChange} />
			{errors.email && <div style={styles.errorText}>{errors.email}</div>}
			<div style={styles.phoneContainer}>
				<select style={styles.select} value={selectedCountry.code} onChange={handleCountryChange}>
					{countries.map((country) => (
						<option key={country.code} value={country.code}>
							{country.name} ({country.dialCode})
						</option>
					))}
				</select>
				<div style={styles.phoneInputWrapper}>
					<span style={styles.dialCode}>{selectedCountry.dialCode}</span>
					<input type="tel" placeholder={phonePlaceholder} style={styles.phoneInput} value={phoneNumber} onChange={handlePhoneChange} />
				</div>
			</div>
			{errors.phoneNumber && <div style={styles.errorText}>{errors.phoneNumber}</div>}
			{/* Honeypot anti-bot : invisible et ignoré par les humains / lecteurs
			    d'écran / gestionnaires de mots de passe. Un remplissage = bot. */}
			<input
				type="text"
				name={HONEYPOT_FIELD}
				value={botField}
				onChange={(e) => setBotField(e.target.value)}
				tabIndex={-1}
				autoComplete="off"
				aria-hidden="true"
				data-lpignore="true"
				data-1p-ignore="true"
				style={styles.hp}
			/>
			{/* Turnstile widget */}
			<div ref={widgetRef} style={styles.turnstile} />
			{errors.submit && <div style={styles.errorText}>{errors.submit}</div>}
			<button
				type="submit"
				style={getButtonStyle()}
				disabled={isSubmitting}
				onMouseEnter={() => setIsHovering(true)}
				onMouseLeave={() => {
					setIsHovering(false);
					setIsPressed(false);
				}}
				onMouseDown={() => setIsPressed(true)}
				onMouseUp={() => setIsPressed(false)}
			>
				{isSubmitting ? 'Envoi…' : buttonText}
			</button>
		</form>
	);
}

const styles = {
	formContainer: {
		maxWidth: '600px',
		margin: 'auto',
		padding: '20px',
		backgroundColor: '#1E1E1E',
		borderRadius: '8px',
		color: '#f1f1f1',
		fontFamily: "'Instrument Sans', sans-serif",
	},
	headline: {
		textAlign: 'left',
		color: '#f1f1f1',
		fontSize: '20px',
		marginTop: '4px',
		marginBottom: '20px',
		fontWeight: 700,
	},
	input: {
		width: '100%',
		padding: '10px',
		marginBottom: '15px',
		backgroundColor: '#333',
		border: '1px solid #444',
		borderRadius: '4px',
		color: '#f1f1f1',
		boxSizing: 'border-box',
		fontFamily: "'Instrument Sans', sans-serif",
		fontSize: '16px',
	},
	phoneContainer: {
		display: 'flex',
		gap: '10px',
		marginBottom: '15px',
	},
	select: {
		padding: '10px',
		backgroundColor: '#333',
		border: '1px solid #444',
		borderRadius: '4px',
		color: '#f1f1f1',
		fontSize: '16px',
		fontFamily: "'Instrument Sans', sans-serif",
		width: '100px', // Increased width to accommodate full country names
	},
	phoneInputWrapper: {
		display: 'flex',
		width: '100px',
		alignItems: 'center',
		flex: 1,
		backgroundColor: '#333',
		border: '1px solid #444',
		borderRadius: '4px',
		padding: '0 10px',
		boxSizing: 'border-box',
	},
	dialCode: {
		color: '#f1f1f1',
		marginRight: '4px',
		fontSize: '16px',
		whiteSpace: 'nowrap',
	},
	phoneInput: {
		flex: 1,
		padding: '10px',
		backgroundColor: 'transparent',
		border: 'none',
		color: '#f1f1f1',
		fontFamily: "'Instrument Sans', sans-serif",
		fontSize: '16px',
		outline: 'none',
	},

	turnstile: {},

	// Honeypot : hors écran, invisible, non focusable. Ne PAS utiliser
	// display:none (certains bots ignorent ces champs et ne se feraient pas
	// piéger).
	hp: {
		position: 'absolute',
		width: '1px',
		height: '1px',
		padding: 0,
		margin: '-1px',
		border: 0,
		overflow: 'hidden',
		clip: 'rect(0 0 0 0)',
		opacity: 0,
		left: '-9999px',
		pointerEvents: 'none',
	},

	button: {
		width: '100%',
		padding: '16px',
		background: 'linear-gradient(to top, #002A54, #5EAFFF)',
		color: '#FFFFFF',
		textDecoration: 'none',
		borderRadius: '8px',
		textAlign: 'center',
		fontWeight: 700,
		fontSize: '18px',
		fontFamily: "'Instrument Sans', sans-serif",
		cursor: 'pointer',
		border: 'none',
		marginTop: '8px',
		boxSizing: 'border-box',
		transition: 'background 0.3s ease, transform 0.1s ease',
	},
	buttonHover: {
		background: 'linear-gradient(to top, #002242, #4B8ED1)',
	},
	buttonPressed: {
		background: 'linear-gradient(to top, #002A54, #5EAFFF)',
		transform: 'scale(0.98)',
	},
	errorText: {
		color: '#ff6b6b',
		marginBottom: '10px',
		fontSize: '14px',
	},
};

// Add property controls for customization
addPropertyControls(CustomCodedHubSpotForm, {
	headline: {
		type: ControlType.String,
		title: 'Headline',
		defaultValue: 'Enter your details to reserve your spot',
	},
	namePlaceholder: {
		type: ControlType.String,
		title: 'Name Placeholder',
		defaultValue: 'Your name...*',
	},
	emailPlaceholder: {
		type: ControlType.String,
		title: 'Email Placeholder',
		defaultValue: 'Your best email...*',
	},
	phonePlaceholder: {
		type: ControlType.String,
		title: 'Phone Placeholder',
		defaultValue: 'Phone Number*',
	},
	buttonText: {
		type: ControlType.String,
		title: 'Button Text',
		defaultValue: 'SAVE MY SPOT!',
	},
});
