// Creation route. The editor is one component for both create and edit; here
// `documentId` is undefined, which is what it reads as "new" (see the isNew
// check there — it has to cover both undefined and the literal "new").
import SiteSettingDetail from "../[documentId]/site-setting";

export default SiteSettingDetail;
